import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Organism, priceDeltaBps, ticksForDelta, stimulusSequence, MAX_TICKS, BASE_TICKS } from './organism.ts';
import { Worm } from './worm.ts';
import { NEURONS, MUSCLES, CELLS, parseRomWord } from './rom.ts';

const round = (roundId: bigint, answer: bigint, updatedAt = 1_757_000_000n) => ({ roundId, answer, updatedAt });

/** A plausible NVDA session in 8-decimal Chainlink units. */
const session = [
  round(1n, 17_850_000_000n),
  round(2n, 17_912_000_000n),
  round(3n, 17_744_000_000n),
  round(4n, 18_310_000_000n),
  round(5n, 18_295_000_000n),
  round(6n, 17_990_000_000n),
];

test('connectome dimensions match the published model', () => {
  assert.equal(NEURONS, 299);
  assert.equal(MUSCLES, 98);
  assert.equal(NEURONS + MUSCLES, CELLS);
});

test('ROM words decode to in-range ids and signed weights', () => {
  // Bit 7 of the low byte carries id bit 8; bits 0-6 are a signed weight.
  assert.deepEqual(parseRomWord(0x2b00), { id: 0x2b, weight: 0 });
  const negative = parseRomWord(0x0040 | (0x2b << 8));
  assert.ok(negative.weight < 0, 'bit 6 set should decode as negative');
});

test('identical input produces an identical state hash', () => {
  const a = new Organism();
  const b = new Organism();
  for (const r of session) {
    a.feed(r);
    b.feed(r);
  }
  assert.equal(a.stateHash(), b.stateHash());
  assert.deepEqual(a.state(), b.state());
});

test('a single differing round changes the state hash', () => {
  const a = new Organism();
  const b = new Organism();
  for (const r of session) a.feed(r);
  for (const r of session.slice(0, -1)) b.feed(r);
  b.feed(round(6n, 17_990_000_001n));
  assert.notEqual(a.stateHash(), b.stateHash());
});

test('replay from genesis reproduces an interrupted run', () => {
  const live = new Organism();
  for (const r of session) live.feed(r);

  const replay = new Organism();
  for (const r of session) replay.feed(r);

  assert.equal(replay.stateHash(), live.stateHash());
});

test('price delta is relative, so it is scale free across tickers', () => {
  // A 1% move is 100bps whether the stock trades at $4 or $900.
  assert.equal(priceDeltaBps(400_00000000n, 404_00000000n), 100);
  assert.equal(priceDeltaBps(900_00000000n, 909_00000000n), 100);
  assert.equal(priceDeltaBps(0n, 100n), 0, 'no baseline yields no movement');
});

test('tick count is bounded so one bad print cannot stall the poster', () => {
  assert.equal(ticksForDelta(0), BASE_TICKS);
  assert.equal(ticksForDelta(1_000_000), MAX_TICKS);
});

test('stimulus mix is roughly eight to two and fully reproducible', () => {
  const first = stimulusSequence(42n, 1000n, 999n, 2000);
  const second = stimulusSequence(42n, 1000n, 999n, 2000);
  assert.deepEqual(first, second);

  const chemotaxis = first.filter((s) => s === 'chemotaxis').length;
  const ratio = chemotaxis / first.length;
  assert.ok(ratio > 0.75 && ratio < 0.85, `expected ~0.8 chemotaxis, got ${ratio}`);
});

test('stimulus sequence spans hash blocks correctly', () => {
  // 2000 ticks needs 63 keccak blocks; a bug at the block boundary would
  // show up as a repeating 32-tick pattern.
  const sequence = stimulusSequence(7n, 5n, 4n, 128);
  const firstBlock = sequence.slice(0, 32).join('');
  const secondBlock = sequence.slice(32, 64).join('');
  assert.notEqual(firstBlock, secondBlock);
});

test('the worm actually moves when fed a volatile session', () => {
  const organism = new Organism();
  for (const r of session) organism.feed(r);
  const state = organism.state();
  assert.ok(state.tick > 0, 'ticks should have run');
  assert.ok(state.x !== 0 || state.y !== 0, 'position should have changed');
});

test('a flat feed still produces baseline activity', () => {
  const organism = new Organism();
  organism.feed(round(1n, 100_00000000n));
  const before = organism.state().tick;
  const result = organism.feed(round(2n, 100_00000000n));
  assert.equal(result.deltaBps, 0);
  assert.equal(result.ticks, BASE_TICKS);
  assert.ok(organism.state().tick > before);
});

test('heading stays within one full turn', () => {
  const organism = new Organism();
  for (let i = 1n; i <= 40n; i++) {
    organism.feed(round(i, 100_00000000n + i * 500_000_000n));
  }
  const { heading } = organism.state();
  assert.ok(heading >= 0 && heading < 3600, `heading out of range: ${heading}`);
});

test('neuron and muscle states stay within their integer widths', () => {
  const worm = new Worm();
  for (let i = 0; i < 500; i++) worm.stimulate(i % 5 === 0 ? 'noseTouch' : 'chemotaxis');
  for (const v of worm.connectome.neuronStates()) {
    assert.ok(v >= -128 && v <= 127, `neuron state out of int8 range: ${v}`);
  }
  for (const v of worm.connectome.muscleStates()) {
    assert.ok(v >= -32768 && v <= 32767, `muscle state out of int16 range: ${v}`);
  }
});
