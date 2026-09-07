# WETWARE

[![verify](https://github.com/prjx283-lgtm/wetware/actions/workflows/verify.yml/badge.svg)](https://github.com/prjx283-lgtm/wetware/actions/workflows/verify.yml) [![poster](https://github.com/prjx283-lgtm/wetware/actions/workflows/poster.yml/badge.svg)](https://github.com/prjx283-lgtm/wetware/actions/workflows/poster.yml)

A *C. elegans* nervous system, running on a stock price, recorded on Robinhood Chain.

299 neurons and 98 muscles, wired from the OpenWorm connectome. Its only sense of
the world is a Chainlink price feed for a tokenized equity. When the stock moves,
the worm is stimulated and it crawls. When the market closes the feed goes quiet
and so does the worm.

Forked openly from [nematoduino](https://github.com/nategri/nematoduino) by
nategri, whose Nanotode model is the thing that makes any of this real. Connectome
weights come from the [OpenWorm](http://openworm.org) project. GPL-2.0-or-later,
same as the original.

---

## What you actually have to trust

This is the only interesting question about a project like this, so it goes first.

**You do not have to trust the operator about the price.** Every state update
names a Chainlink `roundId`. `WetwareState.postState` reads that round back from
the feed and reverts if the reported answer disagrees. The stimulus is
oracle-attested, not asserted.

**You do not have to trust the operator about the simulation**, as long as you are
willing to spend a minute checking. The simulator is deterministic: the same
sequence of oracle rounds produces exactly one `stateHash`, on any machine. Run:

```
npm run verify
```

It pulls every state the contract has recorded, pulls the oracle rounds that
produced them, replays the organism from genesis, and compares every hash. It
prints `VERIFIED`, or it names the exact round where the operator cheated.

Determinism here is deliberate work, not an accident:

- Every integer width from the original C is reproduced exactly, including the
  wrapping. `crossref/` compiles the real nematoduino and asserts the TypeScript
  port matches it tick for tick.
- The stimulus sequence is derived from `keccak256(roundId, answer, previous)`
  rather than a random number generator, so it is reproducible from public data.
  The original DeepWorm used unseeded randomness, which meant nobody could ever
  check its work.
- Position uses a fixed-point sine table, not `Math.sin`, because libm is not
  bit-identical across platforms and would break replay.

**What you do trust, in v1**, is that the operator is running the published code.
v2 removes that: the simulator moves into a Marlin Oyster TEE and the poster key
can only be installed by a remote attestation. The contract hook already exists
(`setVerifier`, `registerEnclaveKey`), so v2 needs no migration and no new state.

---

## Layout

```
packages/core/       deterministic simulator, runs in Node and the browser
  data/connectome.json   299 neurons, 98 muscles, from the nematoduino ROM
  data/sine.json         fixed-point sine table, for reproducible trigonometry
  src/rom.ts             ROM decoding
  src/connectome.ts      the neural cycle, int8/int16 exact
  src/worm.ts            locomotion
  src/organism.ts        price to stimulus, position, state hash
contracts/           WetwareState and interfaces
crossref/            compiles the original C and diffs against the port
services/poster/     deploy, run, simulate, verify, testnet mirror
site/                the live page: replays and verifies in the browser
```

## Commands

```
npm run test:crossref    # TypeScript port vs. the original C, tick by tick
npm run test:core        # simulator behaviour and determinism
npm run test:contracts   # WetwareState against a real EVM
npm run test:poster      # poster services: replay against history, mirror planning
npm run simulate 200     # offline dry run, no chain or key needed
npm run deploy           # deploy WetwareState
npm run deploy:mock      # testnet only: a MockAggregator to stand in for the feed
npm run mirror           # testnet only: copy real mainnet rounds into the mock
npm run poster           # follow the feed and post state
npm run verify           # replay everything on chain and check it
```

## Read first

- [docs/TLDR.md](docs/TLDR.md), one page
- [docs/WHITEPAPER.md](docs/WHITEPAPER.md), the full design: biology, stimulus derivation, determinism, trust model, liveness, v2
- [docs/FAQ.md](docs/FAQ.md)
- [VERIFY.md](VERIFY.md), check the organism yourself in one command

## The live site

`site/` is a page that runs the simulator in the visitor's own browser and
checks it against the chain in real time. It imports `packages/core` and the
poster's `history.ts` unchanged, reads `WetwareStateUpdated` events and the
feed over the public RPC, and replays every recorded state from genesis in a
Web Worker. The badge has three states: verifying, verified, and a divergence
that takes over the page.

```
npm run site            # bundle with esbuild and serve on http://localhost:8787
npm run site:build      # bundle only
```

The site has five pages, all built by `site/build.mjs` into `site/dist`:
`/` (landing, live status from the chain), `/live/` (the verifier), `/paper/`,
`/faq/` and `/verify/`. The last three are rendered from `docs/WHITEPAPER.md`,
`docs/FAQ.md` and `VERIFY.md`, so the site cannot say something the repo does
not. Source pages live in `site/pages/`, scripts in `site/src/`.

On the live page, `?network=testnet` (default) or `?network=mainnet` picks the
contract from `site/src/config.ts`. `?fixture=testnet-honest` and
`?fixture=testnet-corrupt` load captured testnet history from `site/fixtures/`
instead of the chain; the corrupt one has a single altered hash and must turn
the page red. Run it whenever you touch the verifier. A badge that cannot fail
is a lie.

`.github/workflows/site.yml` publishes `site/dist` to GitHub Pages once the
repository variable `WETWARE_PAGES` is `true`. Any static host works; there is
no server.

The site is the one place in the repo with a build step, because a browser
cannot import `.ts`. `esbuild` is a root dev dependency for that alone.

## Keeping it alive

The poster exposes `/health` (JSON: last posted round, seconds since the last
post, poster balance, whether the feed is stale, gas alarm) on `PORT`, 8080 by
default. It returns 503 while the gas alarm is on. The alarm fires when the
poster's balance drops below `GAS_ALARM_ETH` (default 0.002) and is delivered
to `ALERT_WEBHOOK_URL` (POST `{"text"}`, Slack and Discord webhooks work) and
to Telegram if `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, at most
once an hour. Set at least one; an alarm nobody hears is DeepWorm again.

**Where it runs now:** GitHub Actions, `.github/workflows/poster.yml`, every
five minutes. Each run mirrors any new round into the testnet mock, restores
the organism from the chain, posts if the feed advanced, and exits
(`RUN_ONCE=1`). Nothing stays resident, so there is nothing to run out of
memory or hang, and every run is a restart proof. A low balance fails the run,
so the workflow badge above is the alarm. Keys are repository secrets
`POSTER_PRIVATE_KEY` and `MIRROR_PRIVATE_KEY`. The cost is cadence: GitHub's
cron is five minutes at best and often late.

**Resident alternative:** `Dockerfile` and `fly.toml` run it on Fly.io as one
always-on machine that restarts on failure. The key is a Fly secret, set by a
human:

```
flyctl auth login
flyctl apps create wetware-poster
flyctl secrets set POSTER_PRIVATE_KEY=0x...
flyctl secrets set MIRROR_PRIVATE_KEY=0x...        # testnet mirror only
flyctl secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
flyctl deploy --remote-only
flyctl machine restart                             # then: npm run verify still passes
```

On restart the poster replays every recorded state from genesis and refuses
to start if the history does not reproduce, so a restart can never fork the
organism. `FROM_BLOCK` in `fly.toml` keeps that replay to a few seconds.

## Deploying

Robinhood Chain testnet first. Chain 46630, RPC
`https://rpc.testnet.chain.robinhood.com`, faucet at
`https://faucet.testnet.chain.robinhood.com/` which dispenses testnet ETH and
tokenized stock.

### Testnet has no equity feeds

The Chainlink equity aggregators exist on Robinhood Chain mainnet only. On
testnet those addresses hold no code and Chainlink publishes no testnet feed
list for Robinhood. The rehearsal therefore feeds the organism from a
`MockAggregator` that `npm run mirror` fills with real mainnet rounds, round
ids and answers intact. The poster, the contract's price re-check and the
verifier run unchanged; they just take `FEED_ADDRESS`.

```
export DEPLOYER_PRIVATE_KEY=0x...
NETWORK=testnet npm run deploy:mock
export FEED_ADDRESS=0x...             # printed by deploy:mock
NETWORK=testnet FEED=NVDA npm run deploy
export STATE_ADDRESS=0x...            # printed by deploy

# terminal 1: the poster. Start it before the mirror so its genesis round is
# the first one mirrored.
export POSTER_PRIVATE_KEY=0x...
NETWORK=testnet FEED=NVDA npm run poster

# terminal 2: the mirror. BACKFILL writes recent history one round at a time,
# so states land even while the US market is closed.
export MIRROR_PRIVATE_KEY=0x...       # any funded testnet key that is not the poster's
FEED=NVDA BACKFILL=10 npm run mirror

# any time after a few rounds. FROM_BLOCK is the contract's deploy block;
# without it the scan starts at block 0, which works but is slower.
NETWORK=testnet FEED=NVDA FROM_BLOCK=... npm run verify
```

`DRY_RUN=1 npm run mirror` prints what would be written and needs no key.
`deploy:mock` refuses `NETWORK=mainnet`; the mainnet organism must eat from the
real feed.

### Mainnet

```
export DEPLOYER_PRIVATE_KEY=0x...
NETWORK=mainnet FEED=NVDA npm run deploy
export STATE_ADDRESS=0x...            # printed by deploy
export POSTER_PRIVATE_KEY=0x...
NETWORK=mainnet FEED=NVDA npm run poster
```

Mainnet is chain 4663, RPC `https://rpc.mainnet.chain.robinhood.com`, ETH gas at
around 0.32 gwei with 0.1 second blocks. Posting is close to free.

### Feeds

Chainlink equity feeds on Robinhood Chain mainnet, 8 decimals, 24/5:

| Symbol | Feed |
|---|---|
| NVDA | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` |
| AAPL | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` |
| TSLA | `0x4A1166a659A55625345e9515b32adECea5547C38` |
| SPY  | `0x319724394D3A0e3669269846abE664Cd621f9f6A` |

Note these feeds report the price of one *token*, which is the share price times
the token's `uiMultiplier`. The organism does not care, since it works from
relative moves, but a UI showing a dollar figure must divide the multiplier out.

## Tuning constants are consensus critical

`BASE_TICKS`, `TICKS_PER_BP`, `MAX_TICKS`, `CHEMOTAXIS_WEIGHT`, `TURN_DIVISOR`
and `SPEED_DIVISOR` all feed the state hash. Changing any of them after launch
forks the organism and every historical replay stops matching. Set them once,
before genesis.

`TURN_DIVISOR` in particular was set by measurement rather than taste: the median
absolute left/right drive difference is 6, so a large divisor truncates every
turn to zero and the worm walks in a straight line. See the comment on the
constant.

## Credits

- [nematoduino](https://github.com/nategri/nematoduino) and
  [nanotode](https://github.com/nategri/nanotode) by nategri, GPL-2.0
- [OpenWorm](http://openworm.org) for the connectome
- [DeepWorm](https://docs.deepworm.xyz) for proving the idea works, and for
  showing exactly how it dies if nobody keeps the lights on
