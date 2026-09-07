/**
 * Offline dry run.
 *
 * Feeds the organism a synthetic session so you can watch it behave without a
 * chain, a key, or a live feed. Also writes a trace the visualizer can replay.
 *
 *   node --experimental-strip-types services/poster/simulate.ts [rounds]
 */

import { writeFileSync } from 'node:fs';
import { Organism } from '../../packages/core/src/organism.ts';
import { formatAnswer } from './feed.ts';

/**
 * Deterministic synthetic price walk, so runs are comparable. Roughly models a
 * session: mostly small moves with occasional larger ones.
 */
function* syntheticFeed(rounds: number, start = 178_50000000n): Generator<{
  roundId: bigint; answer: bigint; updatedAt: bigint;
}> {
  let price = start;
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };

  for (let i = 1; i <= rounds; i++) {
    const shock = next() < 0.08 ? 40 : 6;
    const move = Math.round((next() - 0.5) * shock * 100);
    price += (price * BigInt(move)) / 100_000n;
    if (price < 1_00000000n) price = 1_00000000n;
    yield { roundId: BigInt(i), answer: price, updatedAt: 1_757_000_000n + BigInt(i * 30) };
  }
}

const rounds = Number(process.argv[2] ?? 200);
const organism = new Organism();
const trace: unknown[] = [];

let totalTicks = 0;
let chemotaxis = 0;
let noseTouch = 0;
let reversals = 0;
let previousLeft = 0;
let minX = 0, maxX = 0, minY = 0, maxY = 0;

console.log(`round     price     move    ticks   position        heading  drive`);
console.log(`-`.repeat(72));

for (const round of syntheticFeed(rounds)) {
  const result = organism.feed(round);
  const s = result.state;
  totalTicks += result.ticks;
  chemotaxis += result.chemotaxisCount;
  noseTouch += result.noseTouchCount;
  if (Math.sign(s.leftMuscle) !== Math.sign(previousLeft) && s.leftMuscle !== 0) reversals++;
  previousLeft = s.leftMuscle;
  minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
  minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);

  trace.push({
    roundId: String(round.roundId), answer: String(round.answer), deltaBps: result.deltaBps,
    ticks: result.ticks, x: s.x, y: s.y, heading: s.heading,
    left: s.leftMuscle, right: s.rightMuscle, hash: result.stateHash,
  });

  if (Number(round.roundId) % 20 === 0 || round.roundId === 1n) {
    console.log(
      String(round.roundId).padStart(5) +
      formatAnswer(round.answer).padStart(11) +
      `${result.deltaBps}bp`.padStart(9) +
      String(result.ticks).padStart(8) +
      `(${s.x},${s.y})`.padStart(16) +
      String(s.heading).padStart(9) +
      `${s.leftMuscle}/${s.rightMuscle}`.padStart(12),
    );
  }
}

const final = organism.state();
console.log(`-`.repeat(72));
console.log(`rounds          ${rounds}`);
console.log(`total ticks     ${totalTicks}`);
console.log(`stimulus mix    ${chemotaxis} chemotaxis / ${noseTouch} nose touch ` +
  `(${((100 * chemotaxis) / (chemotaxis + noseTouch)).toFixed(1)}% food)`);
console.log(`direction flips ${reversals}`);
console.log(`final position  (${final.x}, ${final.y}) heading ${final.heading}`);
console.log(`distance        ${Math.round(Math.hypot(final.x, final.y))} units from origin`);
console.log(`track           ${maxX - minX} x ${maxY - minY} units ` +
  `(aspect ${((maxX - minX) / Math.max(1, maxY - minY)).toFixed(2)}, 1.0 means it explores both axes)`);
console.log(`state hash      ${organism.stateHash()}`);

writeFileSync('services/poster/trace.json', JSON.stringify(trace));
console.log(`\ntrace written to services/poster/trace.json (${trace.length} rounds)`);
