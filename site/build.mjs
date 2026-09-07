/**
 * Build the site into site/dist. The only build step in the repo.
 *
 * Pages are rendered from the same Markdown that lives in docs/ and
 * VERIFY.md, so the site cannot say something the repository does not.
 * The live verifier keeps its own page; everything else shares one shell.
 *
 *   node site/build.mjs            one-off
 *   node site/build.mjs --watch    rebuild JS on change (pages need a re-run)
 */
import * as esbuild from 'esbuild';
import { marked } from 'marked';
import { mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const site = join(root, 'site');
const dist = join(site, 'dist');
const watch = process.argv.includes('--watch');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

// ---------------------------------------------------------------------------
// JavaScript
// ---------------------------------------------------------------------------

const ctx = await esbuild.context({
  entryPoints: ['site/src/main.ts', 'site/src/worker.ts', 'site/src/landing.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outdir: 'site/dist/assets',
  sourcemap: true,
  logLevel: 'info',
  // services/poster/config.ts reads RPC_URL at module load. In a browser
  // there is no process; the pinned URLs in site/src/config.ts are used.
  define: { 'process.env.RPC_URL': 'undefined' },
});
await ctx.rebuild();

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const styles = readFileSync(join(site, 'src', 'styles.css'), 'utf8');
writeFileSync(join(dist, 'assets', 'styles.css'), styles);
cpSync(join(site, 'fixtures'), join(dist, 'fixtures'), { recursive: true });
writeFileSync(join(dist, '.nojekyll'), '');

const NAV = [
  ['live/', 'Live'],
  ['paper/', 'Paper'],
  ['verify/', 'Verify'],
  ['faq/', 'FAQ'],
];

/** Shared shell. `rel` is the path prefix back to the site root. */
function layout({ title, description, body, rel, current, head = '', bodyClass = '' }) {
  const nav = NAV.map(([href, label]) =>
    `<a href="${rel}${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta name="theme-color" content="#070907">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='10' fill='%23070907'/%3E%3Cpath d='M8 40c8-14 14-14 22-2s14 12 26-6' fill='none' stroke='%23e7f0e2' stroke-opacity='.35' stroke-width='7' stroke-linecap='round'/%3E%3Cpath d='M8 40c8-14 14-14 22-2s14 12 26-6' fill='none' stroke='%23b8ff5c' stroke-width='2' stroke-linecap='round'/%3E%3Ccircle cx='52' cy='34' r='4' fill='%23b8ff5c'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${rel}assets/styles.css">
${head}
</head>
<body class="${bodyClass}">
<header class="shell-nav">
  <a class="brand" href="${rel}">WET<em>WARE</em></a>
  <nav>${nav}<a href="https://github.com/prjx283-lgtm/wetware" target="_blank" rel="noopener">Source</a></nav>
</header>
${body}
<footer class="shell-foot">
  <div>GPL-2.0-or-later. Simulator forked from <a href="https://github.com/nategri/nematoduino" target="_blank" rel="noopener">nematoduino</a> by nategri; connectome from the <a href="https://openworm.org" target="_blank" rel="noopener">OpenWorm</a> project. Credit is not endorsement.</div>
  <div>Not an AI. Not a trading signal. Not affiliated with Robinhood or Chainlink. It does not know what NVDA is.</div>
</footer>
</body>
</html>
`;
}

/** A Markdown document as a reading page with a generated table of contents. */
function docPage({ src, title, description, out, current }) {
  const md = readFileSync(src, 'utf8');
  const headings = [];
  let previousDepth = 0;
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map((t) => t.raw ?? t.text ?? '').join('');
    const plain = text.replace(/[*_`]/g, '');
    const id = plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    // An h2 directly under the h1 is the document's subtitle, not a section.
    const subtitle = depth === 2 && previousDepth === 1;
    previousDepth = depth;
    if (!subtitle && (depth === 3 || depth === 2)) headings.push({ depth, id, text: plain });
    return `<h${depth} id="${id}">${marked.parseInline(text)}</h${depth}>`;
  };
  const html = marked.parse(md, { gfm: true, renderer });
  const toc = headings.length > 3
    ? `<aside class="toc"><div class="toc-title">Contents</div>${headings
        .map((h) => `<a class="d${h.depth}" href="#${h.id}">${h.text}</a>`).join('')}</aside>`
    : '';
  const body = `<main class="doc-wrap">${toc}<article class="doc">${html}</article></main>`;
  mkdirSync(join(dist, out), { recursive: true });
  writeFileSync(join(dist, out, 'index.html'), layout({ title, description, body, rel: '../', current }));
}

docPage({
  src: join(root, 'docs', 'WHITEPAPER.md'),
  title: 'WETWARE — Whitepaper',
  description: 'A verifiable nervous system fed by a tokenized equity price. Biology, stimulus derivation, determinism, trust model, liveness, and the road to no operator.',
  out: 'paper', current: 'paper/',
});
docPage({
  src: join(root, 'docs', 'FAQ.md'),
  title: 'WETWARE — FAQ',
  description: 'Is it an AI? Does it predict NVDA? What do you have to trust? Answers, in the order people ask.',
  out: 'faq', current: 'faq/',
});
docPage({
  src: join(root, 'VERIFY.md'),
  title: 'WETWARE — Verify it yourself',
  description: 'Node 22, one command, five minutes. Replay every recorded state from genesis and compare hashes with the chain.',
  out: 'verify', current: 'verify/',
});

// The live verifier keeps its own markup and styles; it only gains the shell.
{
  const page = readFileSync(join(site, 'pages', 'live.html'), 'utf8');
  const head = page.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
  const body = page.match(/<body>([\s\S]*?)<script/)?.[1] ?? '';
  mkdirSync(join(dist, 'live'), { recursive: true });
  writeFileSync(join(dist, 'live', 'index.html'), layout({
    title: 'WETWARE — Live',
    description: 'The worm, crawling, verified in your browser against Robinhood Chain in real time.',
    body: body + '<script type="module" src="../assets/main.js"></script>',
    rel: '../', current: 'live/', head, bodyClass: 'live',
  }));
}

// Landing.
{
  const page = readFileSync(join(site, 'pages', 'index.html'), 'utf8');
  const head = page.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
  const body = page.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
  writeFileSync(join(dist, 'index.html'), layout({
    title: 'WETWARE — a nervous system eating a stock price',
    description: 'A real C. elegans nervous system, 299 neurons, fed by the NVDA price feed on Robinhood Chain. Every state on chain, every tick verifiable in your browser.',
    body, rel: './', current: '', head, bodyClass: 'landing',
  }));
}

console.log('site built into site/dist');
if (watch) { await ctx.watch(); console.log('watching site/src for JS changes'); } else { await ctx.dispose(); }
