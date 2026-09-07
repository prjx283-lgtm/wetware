/**
 * The page.
 *
 * Reads the contract and the feed straight from the public RPC, hands the
 * recorded history to a Web Worker running the real simulator, and shows
 * whether the worker agrees with the chain. There is no backend and no
 * trusted party in this file: the one thing a visitor is asked to trust is
 * the code they are running, which is this.
 */

import { JsonRpcProvider, BrowserProvider, Contract } from 'ethers';
import artifact from '../../contracts/out/WetwareState.json' with { type: 'json' };
import { NETWORKS, STALE_AFTER_MINUTES, type SiteNetwork } from './config.ts';
import { aggregator, latestRound, roundAt, formatAnswer } from '../../services/poster/feed.ts';
import { fetchRecordedStates, type RecordedState } from '../../services/poster/history.ts';
import { priceDeltaBps, ticksForDelta, MAX_TICKS, type OracleRound } from '../../packages/core/src/organism.ts';
import { Dish, CellGrid } from './render.ts';
import type { WorkerOut, ReplayRequest } from './worker.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const params = new URLSearchParams(location.search);
const networkKey = params.get('network') ?? 'testnet';
const net: SiteNetwork = NETWORKS[networkKey] ?? NETWORKS.testnet;
const fixture = params.get('fixture');

const provider = new JsonRpcProvider(net.rpcUrl, net.chainId, { staticNetwork: true });
const state = new Contract(net.state, artifact.abi, provider);
const feed = aggregator(net.feed, provider);

const dish = new Dish($('dish'));
const neurons = new CellGrid($('neurons'), 299, 23, 30);
const muscles = new CellGrid($('muscles'), 98, 49, 200);

const records: RecordedState[] = [];
let lastScannedBlock = net.fromBlock - 1;
let verdict: 'verifying' | 'verified' | 'diverged' = 'verifying';

// ---------------------------------------------------------------------------
// Badge. Three states, and the third one is not allowed to be quiet.
// ---------------------------------------------------------------------------

function setBadge(kind: 'verifying' | 'verified' | 'diverged', title: string, detail: string): void {
  verdict = kind;
  const badge = $('badge');
  badge.classList.remove('verifying', 'verified', 'diverged');
  badge.classList.add(kind);
  $('badge-title').textContent = title;
  $('badge-detail').textContent = detail;
  document.body.classList.toggle('diverged', kind === 'diverged');
  $('divergence-banner').hidden = kind !== 'diverged';
}

function announceDivergence(headline: string, detail: string, link?: string): void {
  setBadge('diverged', headline, detail);
  $('divergence-text').textContent = headline;
  $('divergence-detail').textContent = detail;
  const a = $<HTMLAnchorElement>('divergence-link');
  if (link) { a.href = link; a.hidden = false; } else { a.hidden = true; }
  console.error(`[wetware] ${headline}: ${detail}`);
}

// ---------------------------------------------------------------------------
// Worker: the actual simulator, off the main thread.
// ---------------------------------------------------------------------------

const worker = new Worker('../assets/worker.js', { type: 'module' });

worker.onmessage = (event: MessageEvent<WorkerOut>) => {
  const m = event.data;
  if (m.type === 'state') {
    dish.replay.push({ x: m.x, y: m.y });
    dish.head = { x: m.x, y: m.y, heading: m.heading, left: m.leftMuscle, right: m.rightMuscle };
    neurons.update(m.neurons);
    muscles.update(m.muscles);
    $('tick').textContent = m.tick.toLocaleString();
    $('position').textContent = `${m.x}, ${m.y}`;
    $('heading').textContent = `${(m.heading / 10).toFixed(1)}°`;
    $('drive').textContent = `${m.leftMuscle} / ${m.rightMuscle}`;
    $('hash').textContent = m.hash;
    $('progress').textContent = `${m.checked} of ${m.total} states re-run`;
    const lit = Array.from(m.neurons).filter((v) => v >= 30).length;
    $('neurons-lit').textContent = `${lit} firing`;
    return;
  }
  if (m.type === 'verified') {
    setBadge(
      'verified',
      'Verified',
      `Your browser re-ran every tick from genesis, all ${m.checked} states, and got the same answer the chain holds. Final hash ${m.hash.slice(0, 10)}… at tick ${m.tick.toLocaleString()}.`,
    );
    return;
  }
  if (m.type === 'divergence') {
    dish.divergedAt = Math.max(0, records.findIndex((r) => r.tick === m.tick));
    announceDivergence(
      `Divergence at tick ${m.tick.toLocaleString()}`,
      `The chain recorded ${m.onChain.slice(0, 14)}… for round ${m.roundId}, but replaying the published simulator over the same oracle rounds gives ${m.computed.startsWith('0x') ? m.computed.slice(0, 14) + '…' : m.computed}. Either the operator did not run the published code, or the record was altered. Do not trust states after this one.`,
      m.txHash ? `${net.explorer}/tx/${m.txHash}` : undefined,
    );
    return;
  }
  if (m.type === 'unverifiable') {
    dish.divergedAt = Math.max(0, records.findIndex((r) => r.tick === m.tick));
    announceDivergence(
      `Cannot verify tick ${m.tick.toLocaleString()}`,
      `Oracle round ${m.roundId} is no longer readable from the feed, so the state recorded for it cannot be reproduced. Nothing after it can be checked either.`,
    );
  }
};

worker.onerror = (e) => announceDivergence('Verifier crashed', `The simulator worker failed: ${e.message}. Unverified is not verified.`);

// ---------------------------------------------------------------------------
// History: what the contract recorded, and the oracle rounds that produced it.
// ---------------------------------------------------------------------------

async function roundsFor(newRecords: RecordedState[]): Promise<OracleRound[]> {
  const out: OracleRound[] = [];
  for (let i = 0; i < newRecords.length; i += 8) {
    const batch = newRecords.slice(i, i + 8);
    const rounds = await Promise.all(batch.map((r) => roundAt(feed, r.roundId)));
    for (const r of rounds) if (r) out.push(r);
  }
  return out;
}

function extendChainTrail(newRecords: RecordedState[]): void {
  let last = dish.chain.at(-1) ?? { x: 0, y: 0 };
  for (const r of newRecords) {
    last = { x: last.x + r.deltaX, y: last.y + r.deltaY };
    dish.chain.push(last);
  }
}

function updateStimulus(): void {
  if (records.length === 0) return;
  const last = records.at(-1)!;
  const prev = records.at(-2);
  const bps = prev ? priceDeltaBps(prev.answer, last.answer) : 0;
  const ticks = ticksForDelta(bps);
  $('stim-bps').textContent = prev ? `${bps} bp` : 'genesis';
  $('stim-ticks').textContent = `${ticks} ticks`;
  $('stim-meter').style.width = `${Math.min(100, (ticks / MAX_TICKS) * 100)}%`;
  $('states-count').textContent = records.length.toLocaleString();
  const list = $('log');
  list.innerHTML = '';
  for (const r of records.slice(-8).reverse()) {
    const li = document.createElement('li');
    li.innerHTML = `<span>tick ${r.tick.toLocaleString()}</span><span>${formatAnswer(r.answer)}</span><span>${r.stateHash.slice(0, 10)}…</span>`;
    list.appendChild(li);
  }
}

interface FixtureFile {
  note: string;
  records: Array<Record<string, string | number>>;
  rounds: Array<Record<string, string>>;
}

async function loadFixture(name: string): Promise<{ records: RecordedState[]; rounds: OracleRound[] }> {
  const res = await fetch(`../fixtures/${name}.json`);
  if (!res.ok) throw new Error(`fixture ${name} not found`);
  const file = (await res.json()) as FixtureFile;
  $('fixture-note').textContent = `Fixture mode: ${file.note}`;
  $('fixture-note').hidden = false;
  return {
    records: file.records.map((r) => ({
      tick: BigInt(r.tick), roundId: BigInt(r.roundId), answer: BigInt(r.answer), stateHash: String(r.stateHash),
      deltaX: Number(r.deltaX), deltaY: Number(r.deltaY), heading: Number(r.heading),
      leftMuscle: Number(r.leftMuscle), rightMuscle: Number(r.rightMuscle),
      txHash: String(r.txHash), blockNumber: Number(r.blockNumber),
    })),
    rounds: file.rounds.map((r) => ({ roundId: BigInt(r.roundId), answer: BigInt(r.answer), updatedAt: BigInt(r.updatedAt) })),
  };
}

async function loadHistory(): Promise<void> {
  setBadge('verifying', 'Verifying', 'Reading every recorded state from the chain…');
  let fresh: RecordedState[];
  let rounds: OracleRound[];
  if (fixture) {
    ({ records: fresh, rounds } = await loadFixture(fixture));
  } else {
    const latest = await provider.getBlockNumber();
    fresh = await fetchRecordedStates(state, provider, net.fromBlock);
    lastScannedBlock = latest;
    setBadge('verifying', 'Verifying', `Fetching the ${fresh.length} oracle rounds behind those states…`);
    rounds = await roundsFor(fresh);
  }
  records.push(...fresh);
  extendChainTrail(fresh);
  updateStimulus();
  if (fresh.length === 0) {
    setBadge('verifying', 'Nothing recorded yet', 'The contract has no states. The worm has not been fed.');
    return;
  }
  setBadge('verifying', 'Verifying', `Re-running ${fresh.length} recorded states from genesis in your browser…`);
  worker.postMessage({ type: 'replay', records: fresh, rounds } satisfies ReplayRequest);
}

async function followChain(): Promise<void> {
  if (fixture || verdict === 'diverged') return;
  const latest = await provider.getBlockNumber();
  if (latest <= lastScannedBlock) return;
  const fresh = await fetchRecordedStates(state, provider, lastScannedBlock + 1);
  lastScannedBlock = latest;
  if (fresh.length === 0) return;
  const rounds = await roundsFor(fresh);
  records.push(...fresh);
  extendChainTrail(fresh);
  updateStimulus();
  setBadge('verifying', 'Verifying', `${fresh.length} new state(s) landed. Re-running them…`);
  worker.postMessage({ type: 'follow', records: fresh, rounds } satisfies ReplayRequest);
}

// ---------------------------------------------------------------------------
// The feed: price, freshness, and whether the worm is asleep.
// ---------------------------------------------------------------------------

async function pollFeed(): Promise<void> {
  const round = await latestRound(feed);
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(round.updatedAt));
  const asleep = ageSeconds > STALE_AFTER_MINUTES * 60;
  $('price').textContent = formatAnswer(round.answer);
  $('price-round').textContent = `round ${round.roundId}`;
  $('price-age').textContent = `updated ${describeAge(ageSeconds)}`;
  $('asleep').hidden = !asleep;
  document.body.classList.toggle('asleep', asleep);
}

function describeAge(s: number): string {
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h ago`;
  return `${(s / 86400).toFixed(1)} days ago`;
}

// ---------------------------------------------------------------------------
// Poke.
// ---------------------------------------------------------------------------

let pokeAvailableAt = 0;

async function pollPoke(): Promise<void> {
  const [availableAt, total, pending] = await Promise.all([
    state.pokeAvailableAt() as Promise<bigint>,
    state.totalPokes() as Promise<bigint>,
    state.pendingPokes() as Promise<bigint>,
  ]);
  pokeAvailableAt = Number(availableAt);
  $('pokes-total').textContent = `${total} poke${total === 1n ? '' : 's'} so far, ${pending} pending`;
  renderPokeButton();
}

function renderPokeButton(): void {
  const btn = $<HTMLButtonElement>('poke-btn');
  const now = Math.floor(Date.now() / 1000);
  const wait = pokeAvailableAt - now;
  if (wait > 0) {
    btn.disabled = true;
    btn.textContent = `Cooldown ${wait}s`;
  } else {
    btn.disabled = false;
    btn.textContent = 'Poke the worm';
  }
}

async function poke(): Promise<void> {
  const status = $('poke-status');
  const eth = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!eth) {
    status.textContent = 'Poking is a transaction, so it needs a browser wallet. None found.';
    return;
  }
  try {
    const browser = new BrowserProvider(eth as never);
    await browser.send('eth_requestAccounts', []);
    const hexChain = '0x' + net.chainId.toString(16);
    try {
      await browser.send('wallet_switchEthereumChain', [{ chainId: hexChain }]);
    } catch (e) {
      if ((e as { error?: { code?: number }; code?: number }).error?.code === 4902 || (e as { code?: number }).code === 4902) {
        await browser.send('wallet_addEthereumChain', [{
          chainId: hexChain, chainName: net.name, rpcUrls: [net.rpcUrl],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, blockExplorerUrls: [net.explorer],
        }]);
      } else throw e;
    }
    const signer = await browser.getSigner();
    const writable = new Contract(net.state, artifact.abi, signer);
    status.textContent = 'Confirm in your wallet…';
    const tx = await writable.poke();
    status.textContent = `Poking… ${tx.hash.slice(0, 10)}`;
    await tx.wait();
    status.textContent = `Poked. The contract counted it. ${net.explorer}/tx/${tx.hash}`;
    await pollPoke();
  } catch (e) {
    status.textContent = `Poke failed: ${(e as Error).message.split('(')[0].trim()}`;
  }
}

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------

function frame(): void {
  dish.draw();
  neurons.draw();
  muscles.draw();
  requestAnimationFrame(frame);
}

async function main(): Promise<void> {
  $('net-name').textContent = net.name;
  const c = $<HTMLAnchorElement>('contract-link');
  c.href = `${net.explorer}/address/${net.state}`;
  c.textContent = `${net.state.slice(0, 8)}…${net.state.slice(-4)}`;
  const f = $<HTMLAnchorElement>('feed-link');
  f.href = `${net.explorer}/address/${net.feed}`;
  f.textContent = `${net.symbol} feed`;
  $('poke-btn').addEventListener('click', () => void poke());
  requestAnimationFrame(frame);

  if (!net.state) {
    setBadge('verifying', 'Not deployed', `No WetwareState contract is deployed on ${net.name} yet.`);
    return;
  }

  try {
    await Promise.all([loadHistory(), pollFeed(), pollPoke()]);
  } catch (e) {
    announceDivergence('Could not load the chain', `${(e as Error).message}. Until the chain can be read, nothing here is verified.`);
    return;
  }

  setInterval(() => void followChain().catch((e) => console.warn('[wetware] follow failed', e)), 12_000);
  setInterval(() => void pollFeed().catch((e) => console.warn('[wetware] feed poll failed', e)), 15_000);
  setInterval(() => void pollPoke().catch((e) => console.warn('[wetware] poke poll failed', e)), 15_000);
  setInterval(renderPokeButton, 1000);
}

void main();
