/**
 * Testnet feed mirror.
 *
 * Robinhood Chain testnet has no Chainlink equity feeds. Checked 2026-09-07:
 * the four mainnet aggregator addresses hold no code on chain 46630, and
 * Chainlink publishes no testnet feed list for Robinhood at all. Rule 5 says
 * testnet before mainnet, so this copies real mainnet rounds, round ids and
 * answers intact, into a MockAggregator on testnet.
 *
 * Everything downstream runs unchanged against the mock: the poster, the
 * contract's price re-check and the replay verifier all just take
 * FEED_ADDRESS. That is the point. The rehearsal exercises exactly the code
 * path a stranger will later verify on mainnet, with real price history.
 *
 * Nothing here touches the organism. The mock is a testnet stand-in only and
 * deploy-mock.ts refuses to put it on mainnet.
 *
 *   MIRROR_PRIVATE_KEY=0x... FEED=NVDA FEED_ADDRESS=<mock> npm run mirror
 *
 * Environment:
 *   FEED              source symbol on mainnet, default NVDA
 *   FEED_ADDRESS      the MockAggregator on testnet, required
 *   MIRROR_PRIVATE_KEY signer for setRound on testnet. Use a key that is not
 *                     the poster's, so the two processes never fight over a
 *                     nonce. The deployer key is idle after deploy and fine.
 *   SOURCE_RPC_URL    mainnet RPC to read from, default Robinhood mainnet
 *   BACKFILL          when the mock is empty, also write this many rounds
 *                     before the latest one, oldest first. Lets the rehearsal
 *                     produce states while the US market is closed. Default 0.
 *   STEP_MS           pause between consecutive writes, default 30000. Keep it
 *                     above the poster's POLL_INTERVAL_MS: the poster only
 *                     reads latestRoundData, so rounds that land between two
 *                     polls are skipped. Allowed, but it wastes backfill.
 *   POLL_INTERVAL_MS  how often to check mainnet for a new round, default 15000
 *   DRY_RUN=1         print the plan and write nothing. Needs no key.
 *   RUN_ONCE=1        mirror whatever is pending, then exit. For cron hosts.
 */

import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { readFileSync } from 'node:fs';
import { ROBINHOOD_MAINNET, ROBINHOOD_TESTNET, FEEDS, type FeedSymbol } from './config.ts';
import { aggregator, latestRound, roundAt, formatAnswer } from './feed.ts';

const artifacts = JSON.parse(
  readFileSync(new URL('../../contracts/out/artifacts.json', import.meta.url), 'utf8'),
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chainlink proxy round ids pack a phase in the high 64 bits and a sequence in
 * the low 64. Walking `id + 1` stays inside a phase; a phase change is a gap
 * that must be jumped, not walked.
 */
export const phaseOf = (roundId: bigint): bigint => roundId >> 64n;
const firstOfPhase = (roundId: bigint): bigint => (phaseOf(roundId) << 64n) | 1n;

export interface Plan {
  readonly from: bigint;
  readonly to: bigint;
  /** Set when the plan is not a plain continuation, so the operator sees it. */
  readonly note?: string;
}

/**
 * Which source rounds to write next, given where the mock and the source are.
 *
 * Pure so it can be tested. The cases that matter: an empty mock must seed
 * from history rather than from round 1, a mock in a stale phase must jump
 * rather than walk forever, and a mock that is caught up must do nothing.
 */
export function planRounds(mockLatest: bigint, sourceLatest: bigint, backfill: number): Plan | null {
  if (sourceLatest === 0n) return null;

  if (mockLatest === 0n) {
    const wanted = sourceLatest - BigInt(Math.max(0, backfill));
    const from = wanted < firstOfPhase(sourceLatest) ? firstOfPhase(sourceLatest) : wanted;
    return { from, to: sourceLatest, note: `mock is empty, seeding ${sourceLatest - from + 1n} round(s)` };
  }

  if (mockLatest >= sourceLatest) return null;

  if (phaseOf(mockLatest) !== phaseOf(sourceLatest)) {
    return {
      from: sourceLatest,
      to: sourceLatest,
      note: `source feed moved from phase ${phaseOf(mockLatest)} to ${phaseOf(sourceLatest)}; jumping to its latest round`,
    };
  }

  return { from: mockLatest + 1n, to: sourceLatest };
}

async function main(): Promise<void> {
  const feedSymbol = (process.env.FEED ?? 'NVDA') as FeedSymbol;
  const sourceAddress = FEEDS[feedSymbol];
  if (!sourceAddress) throw new Error(`unknown feed ${feedSymbol}, expected one of ${Object.keys(FEEDS).join(', ')}`);

  const mockAddress = process.env.FEED_ADDRESS;
  if (!mockAddress) throw new Error('FEED_ADDRESS is required: the MockAggregator on testnet');
  if (Object.values(FEEDS).some((a) => a.toLowerCase() === mockAddress.toLowerCase())) {
    throw new Error('FEED_ADDRESS is a real Chainlink feed. The mirror only writes to a MockAggregator.');
  }

  const dryRun = process.env.DRY_RUN === '1';
  const runOnce = process.env.RUN_ONCE === '1';
  const backfill = Number(process.env.BACKFILL ?? 0);
  const stepMs = Number(process.env.STEP_MS ?? 30_000);
  const pollMs = Number(process.env.POLL_INTERVAL_MS ?? 15_000);

  // Read from mainnet explicitly rather than through ROBINHOOD_MAINNET, whose
  // rpcUrl honours RPC_URL. An operator who set RPC_URL for testnet would
  // otherwise silently read the source from the wrong chain.
  const sourceProvider = new JsonRpcProvider(
    process.env.SOURCE_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com',
    ROBINHOOD_MAINNET.chainId,
  );
  const targetProvider = new JsonRpcProvider(ROBINHOOD_TESTNET.rpcUrl, ROBINHOOD_TESTNET.chainId);

  const source = aggregator(sourceAddress, sourceProvider);

  let mock: Contract;
  if (dryRun) {
    mock = new Contract(mockAddress, artifacts.MockAggregator.abi, targetProvider);
  } else {
    const privateKey = process.env.MIRROR_PRIVATE_KEY;
    if (!privateKey) throw new Error('MIRROR_PRIVATE_KEY is required (or set DRY_RUN=1)');
    const wallet = new Wallet(privateKey, targetProvider);
    mock = new Contract(mockAddress, artifacts.MockAggregator.abi, wallet);
    console.log(`[mirror] signer ${wallet.address}`);
  }

  if ((await targetProvider.getCode(mockAddress)) === '0x') {
    throw new Error(`no contract at ${mockAddress} on ${ROBINHOOD_TESTNET.name}. Run npm run deploy:mock first.`);
  }

  console.log(`[mirror] source ${feedSymbol} ${sourceAddress} on ${ROBINHOOD_MAINNET.name}`);
  console.log(`[mirror] target mock ${mockAddress} on ${ROBINHOOD_TESTNET.name}`);
  if (dryRun) console.log('[mirror] DRY RUN: nothing will be written');

  for (;;) {
    try {
      const sourceLatest = await latestRound(source);
      const mockLatest = (await mock.latest()) as bigint;
      const plan = planRounds(mockLatest, sourceLatest.roundId, backfill);

      if (!plan) {
        if (runOnce) {
          console.log(`[mirror] caught up at round ${mockLatest}`);
          return;
        }
        await sleep(pollMs);
        continue;
      }
      if (plan.note) console.log(`[mirror] ${plan.note}`);

      for (let id = plan.from; id <= plan.to; id++) {
        const round = await roundAt(source, id);
        if (!round) {
          console.log(`[mirror] round ${id} not readable on source, skipping`);
          continue;
        }

        const existingUpdatedAt = (await mock.updatedAts(id)) as bigint;
        if (existingUpdatedAt !== 0n) {
          const existingAnswer = (await mock.answers(id)) as bigint;
          if (existingAnswer !== round.answer) {
            // The mock is permissionless on testnet. If someone else has
            // written a different answer for a round we already have, the
            // verifier will report a price mismatch, and it should. Do not
            // paper over it by overwriting.
            console.error(
              `[mirror] round ${id} already on mock with answer ${formatAnswer(existingAnswer)}, ` +
                `source says ${formatAnswer(round.answer)}. Refusing to overwrite.`,
            );
            process.exit(1);
          }
          continue;
        }

        if (dryRun) {
          console.log(
            `[mirror] would write round ${id} @ ${formatAnswer(round.answer)} ` +
              `updatedAt ${new Date(Number(round.updatedAt) * 1000).toISOString()}`,
          );
        } else {
          const tx = await mock.setRound(id, round.answer, round.updatedAt);
          const receipt = await tx.wait();
          console.log(
            `[mirror] round ${id} @ ${formatAnswer(round.answer)} -> ${receipt.hash.slice(0, 10)} ` +
              `(${ROBINHOOD_TESTNET.explorer}/tx/${receipt.hash})`,
          );
        }

        if (id < plan.to) await sleep(stepMs);
      }

      if (dryRun) {
        console.log('[mirror] dry run complete');
        return;
      }
      if (runOnce) return;
    } catch (error) {
      console.error('[mirror] cycle failed, retrying:', (error as Error).message);
      if (runOnce) process.exit(1);
    }

    await sleep(pollMs);
  }
}

// Only run when executed directly, so the test can import planRounds.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
