/**
 * Bundle the site. The only build step in the repo, and it exists because a
 * browser cannot import .ts files. Everything else runs source directly.
 *
 *   node site/build.mjs            one-off
 *   node site/build.mjs --watch    rebuild on change
 */
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['site/src/main.ts', 'site/src/worker.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outdir: 'site/dist',
  sourcemap: true,
  logLevel: 'info',
  // services/poster/config.ts reads RPC_URL at module load. In a browser
  // there is no process; the pinned URLs in site/src/config.ts are used.
  define: { 'process.env.RPC_URL': 'undefined' },
});

if (watch) {
  await ctx.watch();
  console.log('watching site/src');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
