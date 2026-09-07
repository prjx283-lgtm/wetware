/**
 * On-chain history and replay.
 *
 * Two consumers need exactly the same thing: the verifier, to check every
 * hash the contract has ever stored, and the poster, to resume the organism
 * it was running before it died. If those two ever used different code the
 * poster could resume into a nervous system the verifier does not recognise,
 * and the divergence would look like cheating. So there is one implementation
 * of "fetch what was recorded and replay it", here.
 */

import { Contract, type JsonRpcProvider, type Log } from 'ethers';
import { Organism, type OracleRound } from '../../packages/core/src/organism.ts';

export interface RecordedState {
  readonly tick: bigint;
  readonly roundId: bigint;
  readonly answer: bigint;
  readonly stateHash: string;
  /** Movement and drive as the contract recorded them, for anything drawing the worm. */
  readonly deltaX: number;
  readonly deltaY: number;
  readonly heading: number;
  readonly leftMuscle: number;
  readonly rightMuscle: number;
  readonly txHash: string;
  readonly blockNumber: number;
}

/**
 * Every state the contract has ever recorded, oldest first.
 *
 * Starts with a wide block range and halves it on any RPC refusal. Robinhood
 * Chain produces a block every 100ms or so, and a contract is typically
 * deployed a hundred million blocks after genesis, so fixed small chunks
 * turn a five second scan into a five minute one. FROM_BLOCK still short
 * circuits all of it for anyone who knows the deploy block.
 */
export async function fetchRecordedStates(
  state: Contract,
  provider: JsonRpcProvider,
  fromBlock: number,
): Promise<RecordedState[]> {
  const latest = await provider.getBlockNumber();
  const filter = state.filters.WetwareStateUpdated();
  const MIN_CHUNK = 10_000;
  let chunk = 10_000_000;
  const records: RecordedState[] = [];

  let start = fromBlock;
  while (start <= latest) {
    const end = Math.min(start + chunk - 1, latest);
    let logs: Log[];
    try {
      logs = (await state.queryFilter(filter, start, end)) as Log[];
    } catch (error) {
      if (chunk <= MIN_CHUNK) throw error;
      chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 2));
      continue;
    }
    for (const log of logs as (Log & { args: Record<string, bigint | string> })[]) {
      records.push({
        tick: log.args.tick as bigint,
        roundId: log.args.roundId as bigint,
        answer: log.args.answer as bigint,
        stateHash: log.args.stateHash as string,
        deltaX: Number(log.args.deltaX),
        deltaY: Number(log.args.deltaY),
        heading: Number(log.args.heading),
        leftMuscle: Number(log.args.leftMuscle),
        rightMuscle: Number(log.args.rightMuscle),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      });
    }
    start = end + 1;
  }

  return records.sort((a, b) => (a.tick < b.tick ? -1 : a.tick > b.tick ? 1 : 0));
}

export interface Divergence {
  readonly record: RecordedState;
  /** The hash the replay produced, or a short reason when it never got that far. */
  readonly computed: string;
}

export interface ReplayResult {
  readonly organism: Organism;
  /** Records whose hash was recomputed and matched. */
  readonly checked: number;
  /** Records whose oracle round could not be read any more. */
  readonly unreadable: RecordedState[];
  readonly divergence: Divergence | null;
}

/**
 * Run the organism from genesis over the recorded rounds and compare every
 * hash. Stops at the first divergence: after that point nothing downstream
 * can be trusted and continuing would only bury the useful line.
 *
 * `lookup` fetches the oracle round for a recorded round id. It is a function
 * rather than a Contract so this can be exercised without a chain. Pass an
 * existing `organism` to continue a replay with newly recorded states rather
 * than starting over; the browser does this to follow the worm live.
 */
export async function replayRecorded(
  records: readonly RecordedState[],
  lookup: (roundId: bigint) => Promise<OracleRound | null>,
  onProgress?: (checked: number, total: number, organism: Organism, record: RecordedState) => void,
  organism: Organism = new Organism(),
): Promise<ReplayResult> {
  const unreadable: RecordedState[] = [];
  let checked = 0;

  for (const record of records) {
    const round = await lookup(record.roundId);
    if (!round) {
      unreadable.push(record);
      continue;
    }

    // Confirm the recorded price against the oracle independently of the
    // contract's own check, so a compromised contract cannot hide it either.
    if (round.answer !== record.answer) {
      return { organism, checked, unreadable, divergence: { record, computed: 'price does not match the oracle' } };
    }

    const result = organism.feed(round);
    checked++;
    onProgress?.(checked, records.length, organism, record);

    if (result.stateHash.toLowerCase() !== record.stateHash.toLowerCase()) {
      return { organism, checked, unreadable, divergence: { record, computed: result.stateHash } };
    }
  }

  return { organism, checked, unreadable, divergence: null };
}
