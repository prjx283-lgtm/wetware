# WETWARE: project instructions

A *C. elegans* nervous system simulated off-chain, stimulated by a tokenized
equity's Chainlink price feed, with its state recorded on Robinhood Chain.
Forked from nematoduino (GPL-2.0), connectome from OpenWorm.

The project's entire value is that **a stranger can verify we did not cheat**.
Every rule below exists to protect that. When a change would make the code nicer
but the verification weaker, the verification wins.

---

## Hard rules

**1. Never change the consensus constants without being asked explicitly.**

In `packages/core/src/organism.ts`: `BASE_TICKS`, `TICKS_PER_BP`, `MAX_TICKS`,
`CHEMOTAXIS_WEIGHT`, `TURN_DIVISOR`, `SPEED_DIVISOR`.

They feed the state hash. Changing one after launch forks the organism and every
historical replay stops matching for everyone. If you believe one is wrong, say
so and stop. Do not "improve" it.

**2. Never touch private keys.**

Keys come from environment variables only: `POSTER_PRIVATE_KEY`,
`DEPLOYER_PRIVATE_KEY`. Never write a key into a file, a commit, a log line, or
a chat message. Never generate a key and use it unattended. Never add a `.env`
to git. If a task seems to need a key you do not have, stop and ask the user to
run that step themselves.

**3. Never break determinism.**

The simulator must produce identical output on every machine and platform. That
means, inside `packages/core/`:

- No `Math.random()`, no `Date.now()`, no ambient state of any kind.
- No `Math.sin`/`Math.cos`/`Math.sqrt` on any value that reaches the state hash.
  Use the fixed-point sine table in `data/sine.json`. libm is not bit-identical
  across platforms.
- No floating point crossing a state boundary. Integer arithmetic only.
- The int8/int16/uint8 wrapping in `connectome.ts` mirrors the original C
  exactly and is load-bearing. Do not "clean it up" into plain JS numbers.

Verified: the same 200-round run produces hash
`0x0f823b06ce057affa4f28cb744fb1fb0931e90db927a926398aadbffe06a4719` on both
x86 Linux and arm64 macOS. If a change alters that hash, you changed behaviour.

**4. Run all three suites before saying anything works.**

```bash
npm run test:core        # 13 tests, simulator behaviour and determinism
npm run test:contracts   # 8 tests, WetwareState against a real EVM
npm run test:crossref    # 1436 ticks vs. the compiled original C
```

`test:crossref` needs the reference clone and binary:

```bash
git clone --depth 1 https://github.com/nategri/nematoduino.git ref-nematoduino
L=ref-nematoduino/Nematoduino_Library
gcc -O0 -x c -c -Icrossref -I$L $L/utility/connectome.c -o crossref/connectome.o
gcc -O0 -x c -c -Icrossref -I$L $L/utility/muscles.c -o crossref/muscles.o
gcc -O0 -x c -c -Icrossref -I$L $L/utility/neural_rom.c -o crossref/neural_rom.o
g++ -O0 -Icrossref -I$L crossref/main.cpp $L/Worm.cpp $L/behaviors.cpp \
  crossref/*.o -o crossref/refworm
```

Any change under `packages/core/` requires `test:crossref` to pass. It is the
only thing standing between us and a silent drift away from the real worm.

**5. Testnet before mainnet, always.**

**6. GPL-2.0-or-later.** Keep the SPDX headers. Credit nematoduino (nategri) and
OpenWorm in anything user-facing. The repo must stay open source.

---

## Architecture

```
Chainlink equity feed (Robinhood Chain)
        |  latestRoundData()
        v
   poster service  ──> Organism.feed(round)
        |                   |
        |                   +-- deltaBps = |Δprice| / prev, relative not absolute
        |                   +-- ticks = BASE + deltaBps * PER_BP, capped
        |                   +-- stimulus sequence = keccak(roundId, answer, prev)
        |                   +-- 299 neurons / 98 muscles, threshold 30, idle 10
        |                   +-- position via fixed-point sine table
        v
   WetwareState.postState(...)  ──> re-reads the round from the feed,
        |                            reverts on PriceMismatch
        v
   WetwareStateUpdated event  ──> replay verifier, browser visualizer
```

**Trust model.** A reader does not trust the poster about the price: the
contract re-reads the Chainlink round and reverts on mismatch. A reader does not
trust the poster about the simulation either, because it is deterministic and
`npm run verify` replays every state from genesis. What a reader trusts in v1 is
that the operator runs the published code; v2 removes that with a TEE and
attestation, and the contract hook already exists (`setVerifier`,
`registerEnclaveKey`).

## Layout

| Path | What |
|---|---|
| `packages/core/src/rom.ts` | connectome ROM decoding |
| `packages/core/src/connectome.ts` | neural cycle, exact integer widths |
| `packages/core/src/worm.ts` | locomotion, port of Worm.cpp |
| `packages/core/src/organism.ts` | price to stimulus, position, state hash |
| `contracts/WetwareState.sol` | on-chain state, oracle check, poke, v2 hook |
| `crossref/` | compiles the original C and diffs against the port |
| `services/poster/` | deploy, poster, replay verifier, offline simulate |

`packages/core` must stay dependency-light and browser-safe: it runs in Node,
in the browser visualizer, and eventually inside a TEE. Only `@noble/hashes`.
No Node built-ins beyond what works in a browser.

## Verified addresses

Do not invent addresses. These are confirmed on-chain.

| What | Value |
|---|---|
| Robinhood Chain mainnet | chain 4663, `https://rpc.mainnet.chain.robinhood.com` |
| Robinhood Chain testnet | chain 46630, `https://rpc.testnet.chain.robinhood.com` |
| Testnet faucet | `https://faucet.testnet.chain.robinhood.com/` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Chainlink NVDA/USD | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` |
| Chainlink AAPL/USD | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` |
| Chainlink TSLA/USD | `0x4A1166a659A55625345e9515b32adECea5547C38` |
| Chainlink SPY/USD | `0x319724394D3A0e3669269846abE664Cd621f9f6A` |

Feeds are 8 decimals, update 24/5, and report the price of one *token* (share
price times the token's `uiMultiplier`). The organism works from relative moves
so it does not care, but any UI showing dollars must divide the multiplier out.

## Conventions

- TypeScript, ESM, run directly via `node --experimental-strip-types`. No build step.
- Comments explain **why**, especially where the code looks odd on purpose. The
  integer wrapping, the sine table and the keccak stimulus derivation all look
  strange until you know they are protecting determinism. Say so at the site.
- Tests assert real behaviour with a stated reason, not coverage theatre.
- No new dependencies in `packages/core` without asking.
- Never commit `node_modules/`, `ref-nematoduino/`, `crossref/refworm`, `*.o`,
  `.env`, or `services/poster/trace.json`.
