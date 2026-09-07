/**
 * The mirror's round planning.
 *
 * A wrong plan does not crash; it silently skips or duplicates rounds, and
 * the first anyone hears of it is the verifier reporting a divergence on
 * testnet that has nothing to do with the organism. So the planner is pure
 * and pinned here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRounds, phaseOf } from './mirror.ts';

// A real Robinhood NVDA round id: phase 1, sequence 994.
const PHASE1 = 1n << 64n;
const LATEST = PHASE1 + 994n;

test('an empty mock seeds from the latest round, not from round 1', () => {
  const plan = planRounds(0n, LATEST, 0);
  assert.ok(plan);
  assert.equal(plan.from, LATEST);
  assert.equal(plan.to, LATEST);
});

test('backfill on an empty mock writes the latest round plus N before it, oldest first', () => {
  const plan = planRounds(0n, LATEST, 5);
  assert.ok(plan);
  assert.equal(plan.from, LATEST - 5n);
  assert.equal(plan.to, LATEST);
  assert.equal(plan.to - plan.from + 1n, 6n);
});

test('backfill never reaches below the first round of the phase', () => {
  const early = PHASE1 + 3n;
  const plan = planRounds(0n, early, 50);
  assert.ok(plan);
  assert.equal(plan.from, PHASE1 + 1n, 'sequence 0 does not exist in a Chainlink phase');
  assert.equal(plan.to, early);
});

test('a mock that is behind gets exactly the missing rounds', () => {
  const plan = planRounds(LATEST - 3n, LATEST, 99);
  assert.ok(plan);
  assert.equal(plan.from, LATEST - 2n, 'backfill only applies to an empty mock');
  assert.equal(plan.to, LATEST);
  assert.equal(plan.note, undefined);
});

test('a mock that is caught up does nothing', () => {
  assert.equal(planRounds(LATEST, LATEST, 5), null);
  assert.equal(planRounds(LATEST + 1n, LATEST, 5), null, 'ahead of source is also nothing to do');
});

test('a phase change jumps to the new latest instead of walking 2^64 ids', () => {
  const nextPhaseLatest = (2n << 64n) + 7n;
  const plan = planRounds(LATEST, nextPhaseLatest, 5);
  assert.ok(plan);
  assert.equal(plan.from, nextPhaseLatest);
  assert.equal(plan.to, nextPhaseLatest);
  assert.ok(plan.note && plan.note.includes('phase'), 'the jump must be announced');
  assert.equal(phaseOf(nextPhaseLatest), 2n);
});

test('a source feed that has never answered yields no plan', () => {
  assert.equal(planRounds(0n, 0n, 5), null);
});
