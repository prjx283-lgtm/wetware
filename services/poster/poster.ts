/**
 * The poster.
 *
 * Follows a Chainlink equity feed, advances the organism by however many ticks
 * the price move earns, and records the result on Robinhood Chain.
 *
 * Deliberately boring. It holds one key, makes one kind of transaction, and
 * keeps no state of its own beyond the organism itself, which is rebuilt from
 * the chain on startup. If this process dies and restarts, it replays every
 * state it ever recorded and carries on from the same nervous system rather
 * than a fresh one. If it dies and never restarts, anyone else can run this
 * same file and take over, which is the point.
 */

import { JsonRpcProvider, Wallet, Contract, formatEther, parseEther } from 'ethers';
import { readFileSync } from 'node:fs';
import { Organism } from '../../packages/core/src/organism.ts';
import { loadConfig, type PosterConfig } from './config.ts';
import { aggregator, latestRound, roundAt, formatAnswer } from './feed.ts';
import { fetchRecordedStates, replayRecorded } from './history.ts';
import { startHealthServer, Alarm, type HealthStatus } from './health.ts';

const artifact = JSON.parse(
  readFileSync(new URL('../../contracts/out/WetwareState.json', import.meta.url), 'utf8'),
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const config = loadConfig();
  const privateKey = process.env.POSTER_PRIVATE_KEY;
  if (!privateKey) throw new Error('POSTER_PRIVATE_KEY is required');

  const provider = new JsonRpcProvider(config.chain.rpcUrl, config.chain.chainId);
  const wallet = new Wallet(privateKey, provider);
  const state = new Contract(config.stateAddress, artifact.abi, wallet);
  const feed = aggregator(config.feedAddress, provider);

  console.log(`[wetware] ${config.chain.name} (${config.chain.chainId})`);
  console.log(`[wetware] feed ${config.feedSymbol} at ${config.feedAddress}`);
  console.log(`[wetware] state at ${config.stateAddress}`);
  console.log(`[wetware] poster ${wallet.address}`);

  let organism = await restore(config, state, provider, feed);
  let lastPostedRound = (await state.getState()).roundId as bigint;
  let lastPostAt = Date.now();
  let lastPostedAtWall: number | null = null;

  // Health and the gas alarm. See health.ts for why these are not optional.
  const alarm = new Alarm();
  const gasThreshold = parseEther(process.env.GAS_ALARM_ETH ?? '0.002');
  const staleAfterMs = Number(process.env.STALE_AFTER_MINUTES ?? 45) * 60_000;
  let balance = 0n;
  let lastFeedRound = { roundId: 0n, answer: 0n, updatedAt: 0n };
  let lastError: string | null = null;
  let cyclesSinceBalanceCheck = Infinity;

  const health = (): HealthStatus => {
    const feedAgeMs = lastFeedRound.updatedAt === 0n ? Infinity : Date.now() - Number(lastFeedRound.updatedAt) * 1000;
    const gasAlarm = balance < gasThreshold;
    return {
      ok: !gasAlarm,
      network: config.chain.name,
      chainId: config.chain.chainId,
      stateAddress: config.stateAddress,
      feedAddress: config.feedAddress,
      poster: wallet.address,
      tick: organism.state().tick,
      stateHash: organism.stateHash(),
      lastPostedRound: lastPostedRound.toString(),
      lastPostAt: lastPostedAtWall ? new Date(lastPostedAtWall).toISOString() : null,
      secondsSinceLastPost: lastPostedAtWall ? Math.floor((Date.now() - lastPostedAtWall) / 1000) : null,
      feedRound: lastFeedRound.roundId.toString(),
      feedAnswer: formatAnswer(lastFeedRound.answer),
      feedUpdatedAt: lastFeedRound.updatedAt === 0n ? null : new Date(Number(lastFeedRound.updatedAt) * 1000).toISOString(),
      feedStale: feedAgeMs > staleAfterMs,
      posterBalanceEth: formatEther(balance),
      gasAlarmThresholdEth: formatEther(gasThreshold),
      gasAlarm,
      lastError,
      uptimeSeconds: 0,
    };
  };
  // RUN_ONCE: do one cycle and exit. For cron hosts such as GitHub Actions,
  // where nothing stays resident and every run restores from the chain.
  const runOnce = process.env.RUN_ONCE === '1';
  if (!runOnce) startHealthServer(health, Number(process.env.PORT ?? 8080));
  console.log(
    `[wetware] gas alarm below ${formatEther(gasThreshold)} ETH, delivered to: ` +
      (alarm.configured().join(', ') || 'nothing (set ALERT_WEBHOOK_URL or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)'),
  );

  for (;;) {
    let fed = false;
    try {
      // Balance every ~5 minutes, not every poll; it only moves when we post.
      if (cyclesSinceBalanceCheck * config.pollIntervalMs >= 300_000) {
        balance = await provider.getBalance(wallet.address);
        cyclesSinceBalanceCheck = 0;
        if (balance < gasThreshold) {
          await alarm.raise(
            `poster ${wallet.address} on ${config.chain.name} has ${formatEther(balance)} ETH, ` +
              `below the ${formatEther(gasThreshold)} ETH threshold. Top it up or the worm dies.`,
          );
        }
      }
      cyclesSinceBalanceCheck++;

      const round = await latestRound(feed);
      lastFeedRound = round;
      const roundAdvanced = round.roundId > lastPostedRound;
      const heartbeatDue = Date.now() - lastPostAt > config.heartbeatSeconds * 1000;

      if (!roundAdvanced) {
        if (heartbeatDue || runOnce) {
          console.log(
            `[wetware] feed idle at ${formatAnswer(round.answer)}, round ${round.roundId}. ` +
              `The market is closed and the worm is asleep.`,
          );
          lastPostAt = Date.now();
        }
        if (runOnce) break;
        await sleep(config.pollIntervalMs);
        continue;
      }

      fed = true;
      const result = organism.feed(round);
      const s = result.state;

      const tx = await state.postState(
        s.tick, round.roundId, round.answer, s.x, s.y, s.heading,
        s.leftMuscle, s.rightMuscle, result.stateHash,
      );
      const receipt = await tx.wait();

      lastPostedRound = round.roundId;
      lastPostAt = Date.now();
      lastPostedAtWall = Date.now();
      lastError = null;
      cyclesSinceBalanceCheck = Infinity; // re-read the balance after spending

      console.log(
        `[wetware] round ${round.roundId} @ ${formatAnswer(round.answer)} ` +
          `(${result.deltaBps}bp) -> ${result.ticks} ticks, ` +
          `moved (${result.deltaX},${result.deltaY}), tick ${s.tick}, ` +
          `hash ${result.stateHash.slice(0, 10)} in ${receipt.hash.slice(0, 10)}`,
      );
    } catch (error) {
      lastError = (error as Error).message;
      console.error('[wetware] cycle failed, retrying:', lastError);
      if (fed) {
        // The organism advanced but the chain may not have. Feeding the same
        // round again would double-stimulate it and diverge from every
        // replay. The chain is the only record that counts, so rebuild from
        // it rather than guess.
        console.log('[wetware] organism may be ahead of the chain; rebuilding from recorded history');
        organism = await restore(config, state, provider, feed);
        lastPostedRound = (await state.getState()).roundId as bigint;
      }
      if (runOnce) process.exit(1);
    }

    if (runOnce) break;
    await sleep(config.pollIntervalMs);
  }

  if (runOnce) {
    const status = health();
    console.log(`[wetware] once: tick ${status.tick}, balance ${status.posterBalanceEth} ETH, feed ${status.feedStale ? 'stale' : 'live'}`);
    // A low balance fails the run so the host's own failure notification
    // reaches a human, and the workflow badge goes red.
    process.exit(status.gasAlarm ? 2 : 0);
  }
}

/**
 * Rebuild the organism from what the contract has recorded, so a restart
 * resumes the same nervous system rather than being born again.
 *
 * This is the verifier's replay, reused on purpose: if the recorded history
 * does not replay cleanly, the poster refuses to start rather than post on
 * top of a state it cannot reproduce. A poster that continued from a
 * diverged history would be indistinguishable from a cheating one.
 */
async function restore(
  config: PosterConfig,
  state: Contract,
  provider: JsonRpcProvider,
  feed: Contract,
): Promise<Organism> {
  const records = await fetchRecordedStates(state, provider, config.fromBlock);
  if (records.length === 0) {
    console.log('[wetware] genesis: no history to replay');
    return new Organism();
  }

  console.log(`[wetware] replaying ${records.length} recorded states from genesis`);
  const result = await replayRecorded(records, (id) => roundAt(feed, id));

  if (result.divergence) {
    const { record, computed } = result.divergence;
    throw new Error(
      `recorded history does not replay: tick ${record.tick} round ${record.roundId} ` +
        `on chain ${record.stateHash}, replayed ${computed}. Refusing to post on top of it.`,
    );
  }
  if (result.unreadable.length > 0) {
    throw new Error(
      `${result.unreadable.length} recorded round(s) are no longer readable from the feed; ` +
        `cannot reproduce the organism. First: round ${result.unreadable[0].roundId}.`,
    );
  }

  const onChain = await state.getState();
  const hash = result.organism.stateHash();
  if (hash.toLowerCase() !== (onChain.stateHash as string).toLowerCase()) {
    throw new Error(`replayed hash ${hash} does not match the contract's current ${onChain.stateHash}`);
  }

  console.log(`[wetware] restored at tick ${result.organism.state().tick}, hash ${hash.slice(0, 10)}, matches chain`);
  return result.organism;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
