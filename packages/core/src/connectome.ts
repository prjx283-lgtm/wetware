/**
 * Faithful port of nematoduino's connectome emulation.
 *
 * Every integer width in the original C is reproduced exactly: neuron states
 * are int8, muscle states are int16, the per-neuron metadata byte is uint8.
 * This matters because the wrapping behaviour is load-bearing for
 * determinism. A "cleaner" port using JS numbers would drift from the
 * reference implementation and break replay verification.
 */

import {
  ROM,
  NEURONS,
  MUSCLES,
  THRESHOLD,
  MAX_IDLE,
  parseRomWord,
  connectionRange,
} from './rom.ts';

const toInt8 = (v: number): number => (v << 24) >> 24;
const toInt16 = (v: number): number => (v << 16) >> 16;
const toUint8 = (v: number): number => v & 0xff;

export class Connectome {
  /** Current neuron states, int8. */
  private neuronCurrent = new Int8Array(NEURONS);
  /** Next neuron states, int8. */
  private neuronNext = new Int8Array(NEURONS);
  /** Current muscle states, int16. */
  private muscleCurrent = new Int16Array(MUSCLES);
  /** Next muscle states, int16. */
  private muscleNext = new Int16Array(MUSCLES);
  /**
   * Per-neuron metadata. High bit records whether the neuron discharged on
   * the previous tick; low seven bits count ticks spent idle.
   */
  private meta = new Uint8Array(NEURONS);

  /** Read a cell's current state, neurons and muscles sharing one id space. */
  getCurrentState(id: number): number {
    return id < NEURONS ? this.neuronCurrent[id] : this.muscleCurrent[id - NEURONS];
  }

  private getNextState(id: number): number {
    return id < NEURONS ? this.neuronNext[id] : this.muscleNext[id - NEURONS];
  }

  private setNextState(id: number, value: number): void {
    if (id < NEURONS) {
      const v = toInt16(value);
      this.neuronNext[id] = v > 127 ? 127 : v < -128 ? -128 : toInt8(v);
    } else {
      this.muscleNext[id - NEURONS] = toInt16(value);
    }
  }

  private addToNextState(id: number, value: number): void {
    this.setNextState(id, this.getNextState(id) + value);
  }

  /** Propagate a neuron's outgoing weights into the next state. */
  pingNeuron(id: number): void {
    const { address, length } = connectionRange(id);
    for (let i = 0; i < length; i++) {
      const connection = parseRomWord(ROM[address + i]);
      this.addToNextState(connection.id, connection.weight);
    }
  }

  /** Propagate a neuron's weights and reset it to zero. */
  private dischargeNeuron(id: number): void {
    this.pingNeuron(id);
    this.setNextState(id, 0);
  }

  private flagDischarge(id: number, discharged: boolean): void {
    this.meta[id] = discharged ? 0b1000_0000 : this.meta[id] & 0b0111_1111;
  }

  /** Flush neurons whose state has not moved for MAX_IDLE ticks. */
  private handleIdleNeurons(): void {
    for (let i = 0; i < NEURONS; i++) {
      const highBit = this.meta[i] & 0b1000_0000;
      let idleTicks = this.meta[i] & 0b0111_1111;

      if (this.getNextState(i) === this.getCurrentState(i)) {
        this.meta[i] = toUint8(this.meta[i] + 1);
        idleTicks += 1;
      } else {
        this.meta[i] = highBit;
      }

      if (idleTicks > MAX_IDLE) {
        this.setNextState(i, 0);
        this.meta[i] = highBit;
      }
    }
  }

  /** Copy next state into current and clear the next muscle state. */
  private iterateState(): void {
    this.neuronCurrent.set(this.neuronNext);
    this.muscleCurrent.set(this.muscleNext);
    this.muscleNext.fill(0);
  }

  /** Run one tick, optionally stimulating a list of sensory neurons first. */
  neuralCycle(stimulusNeurons: readonly number[] = []): void {
    for (const id of stimulusNeurons) this.pingNeuron(id);

    for (let i = 0; i < NEURONS; i++) {
      if (this.getCurrentState(i) > THRESHOLD) {
        this.dischargeNeuron(i);
        this.flagDischarge(i, true);
      } else {
        this.flagDischarge(i, false);
      }
    }

    this.handleIdleNeurons();
    this.iterateState();
  }

  /** Whether a neuron discharged on the most recent tick. */
  getDischarge(id: number): number {
    return this.meta[id] >> 7;
  }

  /** Copy of all neuron states, for display and hashing. */
  neuronStates(): Int8Array {
    return this.neuronCurrent.slice();
  }

  /** Copy of all muscle states, for display and hashing. */
  muscleStates(): Int16Array {
    return this.muscleCurrent.slice();
  }
}
