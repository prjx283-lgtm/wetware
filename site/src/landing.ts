/**
 * Landing page: a procedural worm in the hero and a live status card.
 *
 * The status card reads the chain with raw JSON-RPC so the landing page does
 * not carry a full Ethereum library; the live page does the real work. What
 * is shown here is exactly what the contract and the feed report.
 */

import { NETWORKS, STALE_AFTER_MINUTES } from './config.ts';

const params = new URLSearchParams(location.search);
const net = NETWORKS[params.get('network') ?? 'testnet'] ?? NETWORKS.testnet;

// Selectors and topic, precomputed so no hashing library is needed here.
const SEL_GET_STATE = '0x1865c57d';
const SEL_LATEST_ROUND = '0xfeaf968c';
const TOPIC_STATE_UPDATED = '0x6231f7130c38858e0eacba81dda8c543d9cb481e5fb41d067432b2eed0407416';

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(net.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

const words = (hex: string): bigint[] => {
  const body = hex.replace(/^0x/, '');
  const out: bigint[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push(BigInt('0x' + body.slice(i, i + 64)));
  return out;
};
const signed = (v: bigint, bits: number): bigint => (v >= 1n << BigInt(bits - 1) ? v - (1n << BigInt(bits)) : v);

const $ = (id: string) => document.getElementById(id)!;

function describeAge(s: number): string {
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h ago`;
  return `${(s / 86400).toFixed(1)} days ago`;
}

async function status(): Promise<void> {
  const card = $('status');
  $('s-net').textContent = net.name;
  if (!net.state) {
    $('status-title').textContent = 'Not deployed on this network yet';
    return;
  }
  try {
    const [stateHex, roundHex, logs] = await Promise.all([
      rpc<string>('eth_call', [{ to: net.state, data: SEL_GET_STATE }, 'latest']),
      rpc<string>('eth_call', [{ to: net.feed, data: SEL_LATEST_ROUND }, 'latest']),
      rpc<unknown[]>('eth_getLogs', [{ address: net.state, topics: [TOPIC_STATE_UPDATED], fromBlock: '0x' + net.fromBlock.toString(16), toBlock: 'latest' }]),
    ]);
    const s = words(stateHex); // tick, roundId, answer, x, y, heading, left, right, stateHash, recordedAt
    const r = words(roundHex); // roundId, answer, startedAt, updatedAt, answeredInRound
    const tick = Number(s[0]);
    const hash = '0x' + s[8].toString(16).padStart(64, '0');
    const answer = signed(r[1], 256);
    const updatedAt = Number(r[3]);
    const age = Math.max(0, Math.floor(Date.now() / 1000) - updatedAt);
    const asleep = age > STALE_AFTER_MINUTES * 60;
    const price = `${answer / 100000000n}.${(answer % 100000000n).toString().padStart(8, '0').slice(0, 2)}`;

    $('s-states').textContent = logs.length.toLocaleString();
    $('s-tick').textContent = tick.toLocaleString();
    $('s-feed').textContent = `${net.symbol} ${price}, updated ${describeAge(age)}`;
    $('s-hash').textContent = tick === 0 ? 'no state yet' : hash;
    $('status-title').textContent = asleep ? 'Dauer. The market is closed, the worm is asleep.' : 'Awake. The market is open.';
    card.classList.add(asleep ? 'asleep' : 'awake');
  } catch (e) {
    $('status-title').textContent = 'Could not read the chain';
    $('s-hash').textContent = (e as Error).message;
  }
}

/** A procedural nematode: sinusoidal body, neurons as points, nerve ring at the head. */
function hero(): void {
  const canvas = $('hero-worm') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const t0 = performance.now();
  const NEURONS = 299;
  // Fixed neuron positions along the body (0 = tail, 1 = head): dense near the head.
  const along: number[] = [];
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x1_0000_0000; };
  for (let i = 0; i < NEURONS; i++) {
    const u = rnd();
    along.push(i < 130 ? 0.82 + u * 0.14 : Math.pow(u, 0.8) * 0.82);
  }
  const offsets = along.map(() => (rnd() - 0.5) * 2);

  function frame(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = (performance.now() - t0) / 1000;

    // Faint grid.
    ctx.strokeStyle = 'rgba(184,255,92,0.045)';
    ctx.lineWidth = 1;
    const step = Math.max(36, Math.round(Math.min(w, h) / 7));
    for (let x = (w * 0.5) % step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = (h * 0.5) % step; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Body path: the canvas is the dish, so the worm lives in the middle of
    // it and drifts slowly, like a specimen under a microscope.
    const len = Math.min(w * 0.78, 520);
    const cx = w * 0.5 + Math.sin(t * 0.07) * w * 0.05;
    const cy = h * 0.52 + Math.cos(t * 0.05) * h * 0.08;
    const angle = -0.35 + Math.sin(t * 0.04) * 0.25;
    const amp = len * 0.085;
    const point = (u: number, lateral = 0) => {
      const x = (u - 0.5) * len;
      const y = Math.sin(u * Math.PI * 2.2 - t * 2.1) * amp * (0.35 + u * 0.65) + lateral * (7 * (0.4 + 0.6 * Math.sin(u * Math.PI)));
      return [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)] as const;
    };

    // Translucent body.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const [x, y] = point(i / 80); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.strokeStyle = 'rgba(231,240,226,0.10)';
    ctx.lineWidth = 16; ctx.stroke();
    ctx.strokeStyle = 'rgba(231,240,226,0.22)';
    ctx.lineWidth = 2; ctx.stroke();
    // Pharynx and gut hints.
    ctx.strokeStyle = 'rgba(126,148,120,0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 8; i <= 74; i++) { const [x, y] = point(i / 80); if (i === 8) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.restore();

    // Neurons.
    ctx.save();
    ctx.shadowColor = '#b8ff5c';
    for (let i = 0; i < NEURONS; i++) {
      const u = along[i];
      const [x, y] = point(u, offsets[i]);
      const flicker = 0.55 + 0.45 * Math.sin(t * 3.1 + i * 1.7);
      const ring = u > 0.82;
      ctx.shadowBlur = ring ? 14 : 8;
      ctx.fillStyle = `rgba(184,255,92,${(ring ? 0.85 : 0.5) * flicker})`;
      ctx.beginPath(); ctx.arc(x, y, ring ? 1.6 : 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** The roadmap as a worm track: milestones are rings on the path, the worm sits where the project is. */
function track(): (() => void) | null {
  const svg = document.querySelector<SVGSVGElement>('#track svg');
  const future = document.getElementById('track-future') as unknown as SVGPathElement | null;
  const done = document.getElementById('track-done') as unknown as SVGPathElement | null;
  const nodes = document.getElementById('track-nodes');
  const labels = document.getElementById('track-labels');
  const head = document.getElementById('track-head') as unknown as SVGPathElement | null;
  const headG = document.getElementById('track-head-g');
  if (!svg || !future || !done || !nodes || !labels || !head || !headG) return null;

  const milestones = [
    { at: 0.04, state: 'done', tag: 'done', title: 'Testnet', text: 'Deployed, fed with real NVDA rounds, verified by terminal, by CI, and by the browser.', side: 'below' },
    { at: 0.30, state: 'next', tag: 'next', title: 'Mainnet genesis', text: 'The real feed, a fresh genesis, the first tick quotable forever.', side: 'above' },
    { at: 0.53, state: '', tag: 'then', title: 'First independent verification', text: 'A stranger replays the record and confirms it. The most important person in the project\'s history.', side: 'below' },
    { at: 0.76, state: '', tag: 'v2', title: 'The enclave', text: 'The simulator inside a sealed enclave. The poster key introduced by attestation.', side: 'above' },
    { at: 0.965, state: '', tag: 'v2', title: 'No operator', text: 'Ownership renounced. Nobody runs the worm. Nobody can.', side: 'below' },
  ];
  const progress = 0.17; // between testnet and mainnet genesis

  const total = future.getTotalLength();
  done.setAttribute('stroke-dasharray', `${total * progress} ${total}`);
  const NS = 'http://www.w3.org/2000/svg';
  for (const m of milestones) {
    const p = future.getPointAtLength(total * m.at);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(p.x)); c.setAttribute('cy', String(p.y)); c.setAttribute('r', '7');
    c.setAttribute('class', `node ${m.state}`);
    nodes.appendChild(c);
    const l = document.createElement('div');
    l.className = `track-label ${m.side}`;
    l.style.left = `${(p.x / 1200) * 100}%`;
    l.style.top = `${(p.y / 340) * 100}%`;
    l.innerHTML = `<div class="tag ${m.state}">${m.tag}</div><h3>${m.title}</h3><p>${m.text}</p>`;
    labels.appendChild(l);
  }

  // The worm at the head of the travelled path, oriented along the track.
  const hp = future.getPointAtLength(total * progress);
  const hq = future.getPointAtLength(Math.min(total, total * progress + 2));
  const angle = (Math.atan2(hq.y - hp.y, hq.x - hp.x) * 180) / Math.PI;
  headG.setAttribute('transform', `translate(${hp.x} ${hp.y}) rotate(${angle})`);
  return () => {
    const t = performance.now() / 1000;
    let d = '';
    const segs = 12, len = 54;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = -u * len;
      const y = Math.sin(u * Math.PI * 2 - t * 6) * 5 * (0.3 + u);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }
    head.setAttribute('d', d);
  };
}

hero();
const wiggle = track();
if (wiggle) { const loop = () => { wiggle(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
void status();
setInterval(() => void status(), 30_000);
