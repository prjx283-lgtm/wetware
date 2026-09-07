/**
 * Connectome ROM access.
 *
 * The ROM is the nematoduino neural ROM, itself derived from the OpenWorm
 * project's published C. elegans connectome. Layout, per word:
 *
 *   word[0]                  number of neuron-type cells (299)
 *   word[1 .. N]             start offset of each neuron's connection list
 *   word[N+1]                end offset of the final neuron's list
 *   word[> N+1]              connection words
 *
 * A connection word is read little-endian as two bytes:
 *   low  byte, bits 0-6      connection weight, 7-bit two's complement
 *   low  byte, bit  7        high bit (bit 8) of the target cell id
 *   high byte                low 8 bits of the target cell id
 *
 * Note the header comment in the original C claims a different bit order.
 * The code is authoritative; the comment is stale. We match the code.
 */

import connectomeData from '../data/connectome.json' with { type: 'json' };

export const ROM: readonly number[] = connectomeData.rom;
export const CELL_IDS: Readonly<Record<string, number>> = connectomeData.cellIds;

/** Total neuron-type cells. */
export const NEURONS = ROM[0];
/** Total cells, neurons plus muscles. */
export const CELLS = 397;
/** Total muscle-type cells. */
export const MUSCLES = CELLS - NEURONS;

/** Neuron state value at which a cell fires. */
export const THRESHOLD = 30;
/** Ticks a neuron may sit unchanged before its state is flushed to zero. */
export const MAX_IDLE = 10;

export interface Connection {
  readonly id: number;
  readonly weight: number;
}

/** Decode one ROM word into a target cell id and a signed weight. */
export function parseRomWord(romWord: number): Connection {
  const lowByte = romWord & 0xff;
  const highByte = (romWord >> 8) & 0xff;

  const id = highByte + ((lowByte & 0b1000_0000) << 1);

  // 7-bit two's complement, sign-extended into bit 7, then read as int8.
  let weightBits = lowByte & 0b0111_1111;
  weightBits = (weightBits + ((weightBits & 0b0100_0000) << 1)) & 0xff;
  const weight = weightBits > 127 ? weightBits - 256 : weightBits;

  return { id, weight };
}

/** Offset and length of a neuron's connection list within the ROM. */
export function connectionRange(neuronId: number): { address: number; length: number } {
  const address = ROM[neuronId + 1];
  const length = ROM[neuronId + 2] - ROM[neuronId + 1];
  return { address, length };
}
