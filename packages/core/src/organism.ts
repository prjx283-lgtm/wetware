/**
 * The WETWARE organism layer.
 *
 * This is the part that is ours rather than nematoduino's. It answers three
 * questions the reference model does not:
 *
 *   1. What stimulates the worm?  A tokenized equity's Chainlink price feed.
 *   2. How is the stimulus sequence chosen?  Deterministically, from a hash
 *      of the oracle round itself, so that anyone replaying the same feed
 *      history reproduces the same nervous system byte for byte.
 *   3. Where is the worm?  Integrated from muscle drive using fixed-point
 *      integer trigonometry, because libm sin/cos are not bit-identical
 *      across platforms and would break replay verification.
 *
 * Everything here is integer arithmetic. No floating point crosses a state
 * boundary. That is what makes the state hash meaningful.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { Worm, type Stimulus } from './worm.ts';
import sineData from '../data/sine.json' with { type: 'json' };

const SINE_N: number = sineData.n;
const SINE_SCALE: number = sineData.scale;
const SINE: readonly number[] = sineData.sin;

/** Heading is stored in SINE_N units per full turn, i.e. tenths of a degree. */
const sinFixed = (heading: number): number => SINE[((heading % SINE_N) + SINE_N) % SINE_N];
const cosFixed = (heading: number): number => sinFixed(heading + SINE_N / 4);

/** Ticks run even when the price does not move, so the worm is never fully still. */
export const BASE_TICKS = 6;
/** Additional ticks per basis point of price movement. */
export const TICKS_PER_BP = 4;
/** Upper bound on ticks per round, so one wild print cannot stall the poster. */
export const MAX_TICKS = 400;
/** Chemotaxis is chosen for digits 0-7, nose touch for 8-9. */
export const CHEMOTAXIS_WEIGHT = 8;
/**
 * Divisor turning muscle drive imbalance into heading change.
 *
 * Consensus critical. Every constant in this block is part of the state hash,
 * so changing one after launch forks the organism: replays of old rounds stop
 * matching and the verifier reports divergence. They are tuned once, here,
 * and then frozen.
 *
 * The value is set from measurement, not taste. Across a long run the median
 * absolute difference between left and right drive is 6 and the maximum is 66.
 * A divisor of 64 therefore truncates almost every turn to zero and the worm
 * crawls in a dead straight line. At 2 the track has an aspect ratio near 1.0,
 * meaning it explores in both axes the way a real nematode does.
 */
export const TURN_DIVISOR = 2;
/**
 * Divisor turning mean muscle drive into distance per tick. Consensus critical.
 * Median drive is around 48, so this yields roughly 3 units of travel per tick.
 */
export const SPEED_DIVISOR = 16;

export interface OracleRound {
  /** Chainlink roundId. */
  readonly roundId: bigint;
  /** Chainlink answer, 8 decimals for Robinhood equity feeds. */
  readonly answer: bigint;
  /** Chainlink updatedAt, unix seconds. */
  readonly updatedAt: bigint;
}

export interface OrganismState {
  /** Total ticks executed since genesis. */
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  /** Heading in tenths of a degree, 0 to 3599. */
  readonly heading: number;
  readonly leftMuscle: number;
  readonly rightMuscle: number;
  readonly lastRoundId: bigint;
  readonly lastAnswer: bigint;
}

/** How one oracle round was turned into nervous activity. */
export interface RoundResult {
  readonly ticks: number;
  readonly deltaBps: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly chemotaxisCount: number;
  readonly noseTouchCount: number;
  readonly state: OrganismState;
  readonly stateHash: string;
}

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

/**
 * Move size in basis points, relative rather than absolute so the same
 * constants work whether the organism is fed a $4 stock or a $900 one.
 */
export function priceDeltaBps(previous: bigint, current: bigint): number {
  if (previous <= 0n) return 0;
  return Number((abs(current - previous) * 10_000n) / previous);
}

/** Ticks to run for a given move. */
export function ticksForDelta(deltaBps: number): number {
  return Math.min(MAX_TICKS, BASE_TICKS + deltaBps * TICKS_PER_BP);
}

/**
 * The stimulus sequence for a round, derived from the round itself.
 *
 * DeepWorm used an unseeded random choice here, which meant nobody could ever
 * check its work. Deriving the sequence from keccak(roundId, answer, previous)
 * makes the whole run reproducible from public oracle data alone.
 */
export function stimulusSequence(
  roundId: bigint,
  answer: bigint,
  previousAnswer: bigint,
  ticks: number,
): Stimulus[] {
  const seed = new Uint8Array(96);
  const view = new DataView(seed.buffer);
  view.setBigUint64(24, roundId & 0xffff_ffff_ffff_ffffn);
  view.setBigInt64(56, answer & 0xffff_ffff_ffff_ffffn);
  view.setBigInt64(88, previousAnswer & 0xffff_ffff_ffff_ffffn);

  const sequence: Stimulus[] = [];
  let block = keccak_256(seed);
  let blockIndex = 0;

  for (let i = 0; i < ticks; i++) {
    const offset = i % 32;
    if (i > 0 && offset === 0) {
      blockIndex += 1;
      const next = new Uint8Array(36);
      next.set(block, 0);
      new DataView(next.buffer).setUint32(32, blockIndex);
      block = keccak_256(next);
    }
    sequence.push(block[offset] % 10 < CHEMOTAXIS_WEIGHT ? 'chemotaxis' : 'noseTouch');
  }

  return sequence;
}

export class Organism {
  private readonly worm = new Worm();
  private tick = 0;
  private x = 0;
  private y = 0;
  private heading = 0;
  private lastRoundId = 0n;
  private lastAnswer = 0n;

  /**
   * Feed one oracle round to the organism.
   *
   * The first round ever seen sets the baseline and produces BASE_TICKS of
   * activity, since there is no previous price to difference against.
   */
  feed(round: OracleRound): RoundResult {
    const deltaBps = priceDeltaBps(this.lastAnswer, round.answer);
    const ticks = ticksForDelta(deltaBps);
    const sequence = stimulusSequence(round.roundId, round.answer, this.lastAnswer, ticks);

    const startX = this.x;
    const startY = this.y;
    let chemotaxisCount = 0;
    let noseTouchCount = 0;

    for (const stimulus of sequence) {
      this.worm.stimulate(stimulus);
      if (stimulus === 'chemotaxis') chemotaxisCount++;
      else noseTouchCount++;
      this.step();
      this.tick++;
    }

    this.lastRoundId = round.roundId;
    this.lastAnswer = round.answer;

    const state = this.state();
    return {
      ticks,
      deltaBps,
      deltaX: this.x - startX,
      deltaY: this.y - startY,
      chemotaxisCount,
      noseTouchCount,
      state,
      stateHash: this.stateHash(),
    };
  }

  /** Integrate one tick of muscle drive into position. */
  private step(): void {
    const left = this.worm.getLeftMuscle();
    const right = this.worm.getRightMuscle();

    const turn = Math.trunc((right - left) / TURN_DIVISOR);
    this.heading = (((this.heading + turn) % SINE_N) + SINE_N) % SINE_N;

    const speed = Math.trunc((left + right) / 2 / SPEED_DIVISOR);
    this.x += Math.trunc((speed * cosFixed(this.heading)) / SINE_SCALE);
    this.y += Math.trunc((speed * sinFixed(this.heading)) / SINE_SCALE);
  }

  state(): OrganismState {
    return {
      tick: this.tick,
      x: this.x,
      y: this.y,
      heading: this.heading,
      leftMuscle: this.worm.getLeftMuscle(),
      rightMuscle: this.worm.getRightMuscle(),
      lastRoundId: this.lastRoundId,
      lastAnswer: this.lastAnswer,
    };
  }

  /** Live neuron states, for the visualizer. */
  neuronStates(): Int8Array {
    return this.worm.connectome.neuronStates();
  }

  /** Live muscle states, for the visualizer. */
  muscleStates(): Int16Array {
    return this.worm.connectome.muscleStates();
  }

  /**
   * Commitment to the organism's entire state.
   *
   * Covers every neuron and muscle, not just the reported summary, so a
   * replay that diverges anywhere in the nervous system is detectable even
   * if the worm happens to end up in the same place.
   */
  stateHash(): string {
    const neurons = this.worm.connectome.neuronStates();
    const muscles = this.worm.connectome.muscleStates();
    const buffer = new Uint8Array(32 + neurons.length + muscles.length * 2);
    const view = new DataView(buffer.buffer);

    view.setUint32(0, this.tick);
    view.setInt32(4, this.x);
    view.setInt32(8, this.y);
    view.setUint32(12, this.heading);
    view.setInt32(16, this.worm.getLeftMuscle());
    view.setInt32(20, this.worm.getRightMuscle());
    view.setBigUint64(24, this.lastRoundId & 0xffff_ffff_ffff_ffffn);

    let offset = 32;
    for (const value of neurons) view.setInt8(offset++, value);
    for (const value of muscles) {
      view.setInt16(offset, value);
      offset += 2;
    }

    // Hex by hand rather than Buffer: core has to run in a browser and a
    // Web Worker, where Buffer does not exist. Same bytes, same string.
    let hex = '0x';
    for (const byte of keccak_256(buffer)) hex += byte.toString(16).padStart(2, '0');
    return hex;
  }
}
