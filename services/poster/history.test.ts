/**
 * Replay against recorded history.
 *
 * The verifier's promise is that a stranger can catch a lying operator. That
 * promise is only worth something if the replay actually fails when the
 * record is wrong, so half of these tests are about failing correctly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Organism, type OracleRound } from '../../packages/core/src/organism.ts';
import { replayRecorded, type RecordedState } from './history.ts';

/** A short synthetic session and the records an honest poster would leave. */
function honestHistory(rounds = 6): { feed: Map<bigint, OracleRound>; records: RecordedState[] } {
  const feed = new Map<bigint, OracleRound>();
  const records: RecordedState[] = [];
  const organism = new Organism();
  let answer = 230_00000000n;
  for (let i = 1; i <= rounds; i++) {
    answer += BigInt((i % 2 === 0 ? 1 : -1) * i) * 50000000n;
    const round = { roundId: (1n << 64n) + BigInt(i), answer, updatedAt: 1_757_000_000n + BigInt(i * 60) };
    feed.set(round.roundId, round);
    const result = organism.feed(round);
    records.push({
      tick: BigInt(result.state.tick), roundId: round.roundId, answer: round.answer,
      stateHash: result.stateHash, deltaX: result.deltaX, deltaY: result.deltaY,
      heading: result.state.heading, leftMuscle: result.state.leftMuscle, rightMuscle: result.state.rightMuscle,
      txHash: '0x' + i.toString(16).padStart(64, '0'), blockNumber: 100 + i,
    });
  }
  return { feed, records };
}

const lookupFrom = (feed: Map<bigint, OracleRound>) => async (id: bigint) => feed.get(id) ?? null;

test('an honest record replays with no divergence and lands on the same organism', async () => {
  const { feed, records } = honestHistory();
  const result = await replayRecorded(records, lookupFrom(feed));
  assert.equal(result.divergence, null);
  assert.equal(result.checked, records.length);
  assert.equal(result.organism.stateHash(), records.at(-1)!.stateHash, 'the poster can resume from this organism');
  assert.equal(result.organism.state().tick, Number(records.at(-1)!.tick));
});

test('one corrupted hash is reported at exactly that record, and replay stops there', async () => {
  const { feed, records } = honestHistory();
  const corrupted = records.map((r, i) => (i === 3 ? { ...r, stateHash: '0x' + 'ee'.repeat(32) } : r));
  const result = await replayRecorded(corrupted, lookupFrom(feed));
  assert.ok(result.divergence, 'a bad hash must not be swallowed');
  assert.equal(result.divergence.record.tick, records[3].tick);
  assert.equal(result.divergence.computed, records[3].stateHash, 'the replay says what the hash should have been');
  assert.equal(result.checked, 4, 'records after the divergence are not checked');
});

test('a recorded price the oracle does not confirm is a divergence even if the hash matches', async () => {
  const { feed, records } = honestHistory();
  const lying = records.map((r, i) => (i === 2 ? { ...r, answer: r.answer + 1n } : r));
  const result = await replayRecorded(lying, lookupFrom(feed));
  assert.ok(result.divergence);
  assert.equal(result.divergence.record.tick, records[2].tick);
  assert.match(result.divergence.computed, /oracle/);
});

test('a round the feed no longer serves is reported as unreadable, not silently skipped', async () => {
  const { feed, records } = honestHistory();
  feed.delete(records[1].roundId);
  const result = await replayRecorded(records, lookupFrom(feed));
  assert.equal(result.unreadable.length, 1);
  assert.equal(result.unreadable[0].tick, records[1].tick);
  // Everything after it diverges, because the organism missed a round. That
  // is the honest answer: the record cannot be verified any more.
  assert.ok(result.divergence);
});
