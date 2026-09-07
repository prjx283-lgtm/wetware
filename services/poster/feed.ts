/**
 * Oracle round collection.
 *
 * The organism must see the same rounds in the same order as anyone who later
 * replays it. That is easy live, where we simply follow the feed, and harder
 * on replay, where we have to walk backwards through round history. Both paths
 * are here so they cannot drift apart.
 */

import { Contract, type Provider } from 'ethers';
import type { OracleRound } from '../../packages/core/src/organism.ts';
import { AGGREGATOR_ABI } from './config.ts';

export function aggregator(address: string, provider: Provider): Contract {
  return new Contract(address, AGGREGATOR_ABI, provider);
}

export async function latestRound(feed: Contract): Promise<OracleRound> {
  const [roundId, answer, , updatedAt] = await feed.latestRoundData();
  return { roundId, answer, updatedAt };
}

export async function roundAt(feed: Contract, roundId: bigint): Promise<OracleRound | null> {
  try {
    const [, answer, , updatedAt] = await feed.getRoundData(roundId);
    if (updatedAt === 0n) return null;
    return { roundId, answer, updatedAt };
  } catch {
    // Aggregator proxies revert rather than return zero for rounds that
    // predate the current phase. Treat that as "no such round".
    return null;
  }
}

/**
 * Every round from `fromRoundId` up to and including `toRoundId`.
 *
 * Chainlink proxy round ids pack a phase in the high 64 bits and a per-phase
 * sequence in the low 64, so incrementing walks within a phase and stops at a
 * phase boundary. Callers replaying across an aggregator upgrade must supply
 * the first round of the new phase themselves; that is rare and loud rather
 * than silent, which is the behaviour we want.
 */
export async function collectRounds(
  feed: Contract,
  fromRoundId: bigint,
  toRoundId: bigint,
  onProgress?: (round: OracleRound) => void,
): Promise<OracleRound[]> {
  const rounds: OracleRound[] = [];
  for (let id = fromRoundId; id <= toRoundId; id++) {
    const round = await roundAt(feed, id);
    if (!round) continue;
    rounds.push(round);
    onProgress?.(round);
  }
  return rounds;
}

/** Human-readable price from an 8-decimal feed answer. */
export function formatAnswer(answer: bigint, decimals = 8): string {
  const negative = answer < 0n;
  const magnitude = negative ? -answer : answer;
  const base = 10n ** BigInt(decimals);
  const whole = magnitude / base;
  const fraction = (magnitude % base).toString().padStart(decimals, '0').slice(0, 2);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
