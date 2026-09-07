/**
 * Cross-validation against the original C implementation.
 *
 * Runs the same stimulus sequence through the TypeScript port and the
 * compiled nematoduino reference, and requires the muscle drive to match on
 * every single tick. If this ever fails, the port has drifted and every
 * state hash we have ever published is suspect.
 */

import { execFileSync } from 'node:child_process';
import { Worm } from '../packages/core/src/worm.ts';

const sequences = [
  'c'.repeat(200),
  'n'.repeat(200),
  'ccccccccccnccccc',
  ('cccccccn'.repeat(50)),
  ('cn'.repeat(150)),
  ('c'.repeat(40) + 'n'.repeat(40)).repeat(4),
];

let totalTicks = 0;
let failures = 0;

for (const sequence of sequences) {
  const reference = execFileSync('./crossref/refworm', [sequence], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.split(' ').map(Number));

  const worm = new Worm();
  for (let i = 0; i < sequence.length; i++) {
    worm.stimulate(sequence[i] === 'c' ? 'chemotaxis' : 'noseTouch');
    const [refLeft, refRight] = reference[i];
    const left = worm.getLeftMuscle();
    const right = worm.getRightMuscle();
    totalTicks++;
    if (left !== refLeft || right !== refRight) {
      failures++;
      if (failures <= 5) {
        console.error(
          `MISMATCH seq[len ${sequence.length}] tick ${i}: ts=(${left},${right}) c=(${refLeft},${refRight})`,
        );
      }
    }
  }
}

console.log(`compared ${totalTicks} ticks across ${sequences.length} sequences`);
if (failures > 0) {
  console.error(`FAILED: ${failures} mismatching ticks`);
  process.exit(1);
}
console.log('PASS: TypeScript port is bit-identical to the C reference');
