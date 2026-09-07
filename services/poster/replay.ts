/**
 * The replay verifier.
 *
 * This is the tool that makes the project's central claim checkable by anyone,
 * so it is written to be read as much as run. It fetches every state the
 * contract has recorded, fetches the oracle rounds that produced them, runs the
 * organism from genesis, and compares the hash at every step.
 *
 * If it prints VERIFIED, the operator has not touched the worm. If it prints a
 * divergence, they have, and the exact round it happened at is named.
 *
 *   node --experimental-strip-types services/poster/replay.ts
 */

import { JsonRpcProvider, Contract } from 'ethers';
import { readFileSync } from 'node:fs';
import { loadConfig } from './config.ts';
import { aggregator, roundAt, formatAnswer } from './feed.ts';
import { fetchRecordedStates, replayRecorded } from './history.ts';

const artifact = JSON.parse(
  readFileSync(new URL('../../contracts/out/WetwareState.json', import.meta.url), 'utf8'),
);

async function main(): Promise<void> {
  const config = loadConfig();

  const provider = new JsonRpcProvider(config.chain.rpcUrl, config.chain.chainId);
  const state = new Contract(config.stateAddress, artifact.abi, provider);
  const feed = aggregator(config.feedAddress, provider);

  console.log(`replaying ${config.feedSymbol} organism at ${config.stateAddress}`);
  console.log(`chain ${config.chain.name} (${config.chain.chainId})\n`);

  const records = await fetchRecordedStates(state, provider, config.fromBlock);
  if (records.length === 0) {
    console.log('no recorded states found. Nothing to verify yet.');
    return;
  }
  console.log(`found ${records.length} recorded states, ticks ${records[0].tick}..${records.at(-1)!.tick}\n`);

  const result = await replayRecorded(records, (id) => roundAt(feed, id), (checked, total) => {
    if (checked % 25 === 0) process.stdout.write(`  verified ${checked}/${total}\r`);
  });

  for (const record of result.unreadable) {
    console.error(
      `round ${record.roundId} is no longer readable from the feed; cannot verify tick ${record.tick}`,
    );
  }

  console.log('');
  if (!result.divergence) {
    console.log(`VERIFIED: ${result.checked} states replay exactly.`);
    console.log(`final hash ${result.organism.stateHash()}`);
    console.log(`final tick ${result.organism.state().tick}`);
    process.exit(0);
  }

  const { record, computed } = result.divergence;
  console.error(`DIVERGENCE at tick ${record.tick}, round ${record.roundId} @ ${formatAnswer(record.answer)}`);
  console.error(`  on chain: ${record.stateHash}`);
  console.error(`  replayed: ${computed}`);
  console.error(`  tx:       ${config.chain.explorer}/tx/${record.txHash}`);
  console.error(`FAILED: the organism on chain is not the published one.`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
