/**
 * The replay, off the main thread.
 *
 * This is the same `replayRecorded` the command-line verifier and the poster
 * use, running the same `Organism` from `packages/core`. Nothing here is a
 * second implementation. If the page says verified, it is because this
 * worker ran every recorded round from genesis and got the hashes the
 * contract stored; if it says divergence, the page is not allowed to soften
 * that.
 */

import { Organism, type OracleRound } from '../../packages/core/src/organism.ts';
import { replayRecorded, type RecordedState } from '../../services/poster/history.ts';

export interface StateMessage {
  readonly type: 'state';
  readonly checked: number;
  readonly total: number;
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly leftMuscle: number;
  readonly rightMuscle: number;
  readonly roundId: bigint;
  readonly answer: bigint;
  readonly hash: string;
  readonly neurons: Int8Array;
  readonly muscles: Int16Array;
}

export type ResultMessage =
  | { readonly type: 'verified'; readonly checked: number; readonly tick: number; readonly hash: string }
  | {
      readonly type: 'divergence';
      readonly tick: bigint;
      readonly roundId: bigint;
      readonly onChain: string;
      readonly computed: string;
      readonly txHash: string;
    }
  | { readonly type: 'unverifiable'; readonly roundId: bigint; readonly tick: bigint };

export type WorkerOut = StateMessage | ResultMessage;

export interface ReplayRequest {
  readonly type: 'replay' | 'follow';
  readonly records: RecordedState[];
  readonly rounds: OracleRound[];
}

let organism = new Organism();
let checkedSoFar = 0;
let totalSoFar = 0;
let diverged = false;
const rounds = new Map<bigint, OracleRound>();

const post = (message: WorkerOut) => (self as unknown as Worker).postMessage(message);

self.onmessage = async (event: MessageEvent<ReplayRequest>) => {
  const request = event.data;
  if (request.type === 'replay') {
    organism = new Organism();
    checkedSoFar = 0;
    totalSoFar = 0;
    diverged = false;
    rounds.clear();
  }
  if (diverged) return; // nothing after a divergence can be trusted; do not paper over it

  for (const round of request.rounds) rounds.set(round.roundId, round);
  const base = checkedSoFar;
  totalSoFar += request.records.length;

  const result = await replayRecorded(
    request.records,
    async (id) => rounds.get(id) ?? null,
    (checked, _total, org, record) => {
      const s = org.state();
      post({
        type: 'state',
        checked: base + checked,
        total: totalSoFar,
        tick: s.tick,
        x: s.x,
        y: s.y,
        heading: s.heading,
        leftMuscle: s.leftMuscle,
        rightMuscle: s.rightMuscle,
        roundId: record.roundId,
        answer: record.answer,
        hash: org.stateHash(),
        neurons: Int8Array.from(org.neuronStates()),
        muscles: Int16Array.from(org.muscleStates()),
      });
    },
    organism,
  );
  checkedSoFar = base + result.checked;

  if (result.divergence) {
    diverged = true;
    const { record, computed } = result.divergence;
    post({
      type: 'divergence',
      tick: record.tick,
      roundId: record.roundId,
      onChain: record.stateHash,
      computed,
      txHash: record.txHash,
    });
    return;
  }
  if (result.unreadable.length > 0) {
    diverged = true;
    post({ type: 'unverifiable', roundId: result.unreadable[0].roundId, tick: result.unreadable[0].tick });
    return;
  }
  post({ type: 'verified', checked: checkedSoFar, tick: organism.state().tick, hash: organism.stateHash() });
};
