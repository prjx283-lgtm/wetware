/**
 * Locomotion layer. Port of nematoduino's Worm.cpp.
 *
 * Turns connectome muscle states into a left/right drive pair. The uint16
 * accumulators here can and do wrap, exactly as in the original; that is
 * preserved deliberately.
 */

import { Connectome } from './connectome.ts';
import {
  LEFT_BODY_MUSCLE,
  RIGHT_BODY_MUSCLE,
  LEFT_NECK_MUSCLE,
  RIGHT_NECK_MUSCLE,
  MOTOR_NEURON_A,
  BODY_MUSCLES,
  NECK_MUSCLES,
  MOTOR_A,
  CHEMOTAXIS,
  NOSE_TOUCH,
} from './muscles.ts';

/** Rolling-average window over motor-A neuron firing. */
const AVG_WINDOW = 15;
/**
 * Motor-A firing percentage above which locomotion reverses. Read off the
 * c_matoduino reference simulation by nematoduino's author; it is a fitted
 * constant, not a derived one.
 */
const REVERSE_THRESHOLD = 19.0;

export type Stimulus = 'chemotaxis' | 'noseTouch';

export class Worm {
  readonly connectome = new Connectome();
  private leftMuscle = 0;
  private rightMuscle = 0;
  private motorFireAvg = 16.0;

  /** Apply a food stimulus and advance one tick. */
  chemotaxis(): void {
    this.update(CHEMOTAXIS);
  }

  /** Apply a collision stimulus and advance one tick. */
  noseTouch(): void {
    this.update(NOSE_TOUCH);
  }

  /** Advance one tick with the given stimulus. */
  stimulate(stimulus: Stimulus): void {
    if (stimulus === 'chemotaxis') this.chemotaxis();
    else this.noseTouch();
  }

  getLeftMuscle(): number {
    return this.leftMuscle;
  }

  getRightMuscle(): number {
    return this.rightMuscle;
  }

  /** Rolling motor-A activity percentage. Above REVERSE_THRESHOLD the worm backs up. */
  getMotorFireAvg(): number {
    return this.motorFireAvg;
  }

  private update(stimulusNeurons: readonly number[]): void {
    const ctm = this.connectome;

    ctm.neuralCycle(stimulusNeurons);

    // Body muscles: sum both sides, clamping negatives to zero.
    let bodyTotal = 0;
    for (let i = 0; i < BODY_MUSCLES; i++) {
      const left = Math.max(0, ctm.getCurrentState(LEFT_BODY_MUSCLE[i]));
      const right = Math.max(0, ctm.getCurrentState(RIGHT_BODY_MUSCLE[i]));
      bodyTotal = (bodyTotal + left + right) & 0xffff;
    }
    const normBodyTotal = Math.trunc((255.0 * bodyTotal) / 600.0) & 0xffff;

    // Neck muscles: kept per side, since their difference steers.
    let leftNeckTotal = 0;
    let rightNeckTotal = 0;
    for (let i = 0; i < NECK_MUSCLES; i++) {
      leftNeckTotal = (leftNeckTotal + Math.max(0, ctm.getCurrentState(LEFT_NECK_MUSCLE[i]))) & 0xffff;
      rightNeckTotal = (rightNeckTotal + Math.max(0, ctm.getCurrentState(RIGHT_NECK_MUSCLE[i]))) & 0xffff;
    }

    const neckContribution = leftNeckTotal - rightNeckTotal;
    let leftTotal: number;
    let rightTotal: number;
    if (neckContribution < 0) {
      leftTotal = 6 * Math.abs(neckContribution) + normBodyTotal;
      rightTotal = normBodyTotal;
    } else {
      leftTotal = normBodyTotal;
      rightTotal = 6 * Math.abs(neckContribution) + normBodyTotal;
    }

    // Sustained motor-A activity means the worm is reversing.
    let motorNeuronSum = 0;
    for (let i = 0; i < MOTOR_A; i++) {
      motorNeuronSum += ctm.getDischarge(MOTOR_NEURON_A[i]);
    }
    const motorNeuronPercent = (100.0 * motorNeuronSum) / MOTOR_A;
    this.motorFireAvg =
      (motorNeuronPercent + AVG_WINDOW * this.motorFireAvg) / (AVG_WINDOW + 1.0);

    if (this.motorFireAvg > REVERSE_THRESHOLD) {
      leftTotal *= -1;
      rightTotal *= -1;
    }

    this.leftMuscle = leftTotal;
    this.rightMuscle = rightTotal;
  }
}
