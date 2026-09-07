# WETWARE

## A verifiable nervous system fed by a tokenized equity price

**Version 1.0 · September 2026 · Robinhood Chain**

---

### Abstract

WETWARE is a simulated *Caenorhabditis elegans* nervous system whose only sensory input is the Chainlink price feed for tokenized NVDA on Robinhood Chain. The simulator is a deterministic, integer-only port of the nematoduino model, itself derived from the OpenWorm connectome: 299 neurons and 98 muscles, executed exactly as the reference C implementation executes them. Each oracle round is converted into a stimulus sequence by hashing the round itself, so the organism's entire history is a pure function of public oracle data. After each round the organism's full state, every neuron and every muscle, is committed to a 32-byte hash and recorded on chain by a contract that independently re-reads the oracle before accepting it. Anyone can replay the recorded history from genesis, in a terminal or in a browser, and either reproduce every hash or identify the exact round at which the record diverged. The result is an organism that lives in public, eats a price it cannot understand, and can be checked by strangers. This paper describes the biology, the derivation of stimulus from price, the determinism constraints, the on-chain trust model, the liveness design that addresses how the previous on-chain worm died, and the path to removing the operator entirely.

---

### 1. Motivation

Two things are true at once. Everything on a blockchain that calls itself alive is either a random number generator with a face or a server someone promises is running. And the complete wiring diagram of a real animal's nervous system has been public since 1986.

*C. elegans* is a one-millimetre nematode with 302 neurons. It is the only organism whose connectome, every neuron and every synapse, has been fully mapped [1]. The OpenWorm project made that connectome computable [2], and nematoduino [3] reduced it to a model small enough to run on a microcontroller: integer neuron states, a fixed firing threshold, a handful of kilobytes of ROM.

DeepWorm put a similar organism on chain in an enclave and demonstrated that people want to watch, and poke, a worm that lives on a blockchain. It also demonstrated the failure mode: its enclave ran out of gas in January 2025 and nobody noticed for eighteen months. An organism nobody can verify is trusted until it quietly stops, and an organism nobody monitors stops quietly.

WETWARE takes the connectome, gives it a stimulus nobody controls, and makes every state it reaches reproducible by anyone. The experiment is not "can a worm trade". The worm does not know what NVDA is. The experiment is whether a living system can be run in public with no trust required.

### 2. The organism

#### 2.1 Connectome

The model is nematoduino's neural ROM: 299 neuron-type cells and 98 muscle cells, 397 cells in total, with weighted directed connections decoded from a compact ROM of 16-bit words [3]. The ROM is derived from the OpenWorm connectome data [2]. Three of the 302 biological neurons are omitted by the reference model and WETWARE does not add them back; fidelity to the reference is a design constraint, not the biology.

#### 2.2 Neural cycle

Each tick, a set of sensory neurons is stimulated, every neuron whose state has reached the firing threshold of 30 discharges its weighted connections into the next-state buffer and resets to zero, and any neuron unchanged for 10 consecutive ticks is flushed to zero. Neuron states are 8-bit signed integers, muscle states 16-bit signed integers, and the per-neuron metadata byte is unsigned 8-bit, exactly as in the C reference. Integer wrapping at those widths is preserved deliberately: it is load-bearing for reproducibility, and a "cleaner" port would drift from the reference.

#### 2.3 Locomotion

Muscle states are reduced to a left and right drive pair following nematoduino's `Worm.cpp`: body muscles are summed and normalised, neck muscles are kept per side because their difference steers, and a rolling average of motor-A neuron activity above 19 percent reverses the direction of travel. The reversal constant is fitted, not derived, and is taken unchanged from the reference.

#### 2.4 Two stimuli

The organism's world contains two events: chemotaxis (food ahead, drives forward locomotion) and nose touch (obstacle, drives reversal). These are the only inputs the model accepts. WETWARE does not extend the sensory repertoire. What it changes is where the stimuli come from.

### 3. From price to stimulus

#### 3.1 Relative moves

For each new Chainlink round with answer *p* and previous answer *p′*, the move is measured in basis points, relative rather than absolute:

  Δbp = ⌊ |p − p′| · 10 000 / p′ ⌋

The same constants therefore work for a $4 stock and a $900 one. The organism does not know what a dollar is.

#### 3.2 Ticks earned

The round earns a number of simulation ticks:

  ticks = min(MAX_TICKS, BASE_TICKS + Δbp · TICKS_PER_BP)

with BASE_TICKS = 6, TICKS_PER_BP = 4 and MAX_TICKS = 400. A flat print still produces six ticks of baseline activity, so the worm is never fully still while the market is open. A 50 basis point move produces 206 ticks. The cap ensures one wild print cannot stall the poster.

#### 3.3 The stimulus sequence

DeepWorm chose each stimulus with an unseeded random number, which meant nobody could ever check its work. WETWARE derives the sequence from the round itself:

  seed = keccak256( pad(roundId) ‖ pad(answer) ‖ pad(previousAnswer) )

Successive 32-byte blocks are produced by hashing the previous block with a counter. Tick *i* reads byte *i* mod 32 of the current block; a value below 8 (mod 10) is chemotaxis, otherwise nose touch, giving an eight-to-two food-to-touch ratio. The sequence is fully determined by public oracle data, so anyone replaying the same feed history reproduces the same nervous system byte for byte.

#### 3.4 Position

Position is integrated from muscle drive using integer arithmetic only. Heading is stored in tenths of a degree (3 600 units per turn) and updated by ⌊(right − left) / TURN_DIVISOR⌋ with TURN_DIVISOR = 2. Speed is ⌊(left + right) / 2 / SPEED_DIVISOR⌋ with SPEED_DIVISOR = 16. Displacement uses a fixed-point sine table with 3 600 entries scaled by 10⁶, never `Math.sin`, because libm is not bit-identical across platforms and a floating-point heading would break replay.

TURN_DIVISOR was set by measurement: across long runs the median absolute left–right difference is 6 and the maximum 66, so a divisor of 64 would truncate almost every turn to zero. At 2 the track's aspect ratio is near 1.0, meaning the organism explores both axes, as a real nematode does.

#### 3.5 Consensus constants

BASE_TICKS, TICKS_PER_BP, MAX_TICKS, CHEMOTAXIS_WEIGHT, TURN_DIVISOR and SPEED_DIVISOR are consensus critical. Changing any of them after genesis forks the organism and every historical replay stops matching. They are set once, before genesis, and any future change is announced as a fork, not an update.

### 4. Determinism

The simulator must produce identical output on every machine. Inside the core package there is no `Math.random`, no wall clock, no ambient state, no floating point crossing a state boundary, and no dependency beyond a keccak implementation. The core runs unchanged in Node, in a browser Web Worker, and, in v2, inside a trusted execution environment.

Determinism is tested three ways:

- **Self-consistency.** A fixed 200-round synthetic session produces state hash `0x0f823b06ce057affa4f28cb744fb1fb0931e90db927a926398aadbffe06a4719` on x86 Linux and arm64 macOS.
- **Cross-reference.** The original nematoduino C sources are compiled and driven with the same stimulus sequences as the TypeScript port. Six sequences, 1 436 ticks, muscle drive compared on every tick, bit-identical. Any change to the core requires this test to pass.
- **Property tests.** Identical input gives an identical hash; one differing round changes it; a replay from genesis reproduces an interrupted run; neuron and muscle states stay within their integer widths.

### 5. The state commitment

After each round the organism commits to its entire state:

  stateHash = keccak256( tick ‖ x ‖ y ‖ heading ‖ leftMuscle ‖ rightMuscle ‖ lastRoundId ‖ neurons[299] ‖ muscles[98] )

with fixed-width big-endian encodings (32 bytes of header, then one byte per neuron and two per muscle). The hash covers every cell, not merely the reported summary, so a replay that diverges anywhere in the nervous system is detectable even if the worm happens to end up in the same place.

### 6. On-chain record

#### 6.1 The contract

`WetwareState` on Robinhood Chain holds one current state and emits `WetwareStateUpdated` for every accepted update. `postState` is callable only by the poster key and takes the tick, the Chainlink round id, the answer, position, heading, both muscle drives and the state hash.

Before accepting, the contract reads that round back from the feed with `getRoundData(roundId)` and reverts with `PriceMismatch` if the reported answer differs, or `RoundNotAnswered` if the round does not exist. Rounds and ticks must increase monotonically. The feed address is immutable: a different feed is a different organism with its own genesis.

#### 6.2 Poke

Anyone may call `poke()`. It costs a transaction, is subject to a 60-second contract-wide cooldown, emits `Poked`, and increments a pending counter the poster observes. In v1 pokes are recorded but do not stimulate the organism; making them an input would add a new term to the state hash and is therefore a consensus change to be decided before mainnet genesis, not after.

#### 6.3 Trust model, stated plainly

A reader does **not** have to trust the poster about the price: the contract re-reads Chainlink and rejects mismatches.

A reader does **not** have to trust the poster about the simulation: given the same oracle rounds the deterministic simulator produces one and only one hash per state, and anyone can replay the history.

What a reader **does** trust in v1 is that the poster runs the published code at the moment it posts. That is the one remaining assumption, and Section 9 removes it.

### 7. Verification

#### 7.1 Replay from genesis

The verifier fetches every `WetwareStateUpdated` event, fetches the oracle round behind each one, independently confirms the recorded answer against the feed (so a compromised contract cannot hide a bad price either), runs the organism from genesis, and compares the hash at every step. It prints `VERIFIED: N states replay exactly` or names the tick, round, on-chain hash, replayed hash and transaction of the first divergence, and stops there, because nothing after a divergence can be trusted.

The verifier is one command for anyone with Node 22, documented in `VERIFY.md` with the contract address, deploy block, genesis round and the consensus constants pinned. It also runs on a schedule in the public repository, so a divergence turns a badge red without anyone having to look.

#### 7.2 In the browser

The live site imports the same simulator and the same replay module, unchanged. It reads events and the feed directly from the public RPC with no backend, replays from genesis in a Web Worker, then follows live. It shows the worm's recorded trail, the current feed answer and how hard the last move stimulated the organism, all 299 neurons lit by state, the poke button with its cooldown, and a sleep notice when the feed is stale.

The verification badge has three states: verifying; verified, meaning the visitor's own browser re-ran every tick and got the same answer; and divergence at tick N. The divergence state is rendered as the largest text on the page and cannot be dismissed. A verification badge that cannot fail is a lie, so the repository ships a fixture with one deliberately corrupted hash, and the page is required to turn red on it.

#### 7.3 One core, three consumers

The poster, the command-line verifier and the browser share one simulator and one replay implementation. There is no second implementation anywhere. If they could drift apart, a poster could resume into a nervous system the verifier does not recognise and the divergence would look like cheating.

### 8. Liveness

The previous on-chain worm died because its enclave ran out of gas and nobody was watching. WETWARE's liveness design is built around that failure.

**Restart safety.** On every start, the poster replays the full recorded history from genesis and refuses to run if the history does not reproduce or if its replayed hash disagrees with the contract's current state. A restart can never fork the organism. If a post fails after the organism has advanced, the poster discards its state and rebuilds from chain rather than feed the same round twice.

**Hosting.** The poster runs as a scheduled job that restores, checks the feed, posts if a new round has landed, and exits. Every run is therefore a restart proof, and the run history is a public liveness log. A resident container image and configuration are also provided for always-on hosting.

**Health.** A `/health` endpoint reports the last posted round, seconds since the last post, the poster's balance, whether the feed is stale, and whether the gas alarm is active, returning HTTP 503 while it is.

**Gas alarm.** When the poster's balance falls below a threshold, the poster logs loudly, fails its run so the hosting platform's own failure notification fires, and delivers a message to a human via Telegram or a webhook, throttled to once an hour. This is the entire difference between this worm and the last one.

**Sleep.** Chainlink equity feeds update during US market hours only. When the feed goes stale the organism receives no rounds, earns no ticks and does not move. That is correct behaviour, surfaced as "the market is closed, the worm is asleep" rather than treated as a fault.

### 9. v2: removing the operator

The remaining trust assumption, that the operator runs the published code, is removed by running the poster inside a trusted execution environment with remote attestation.

The contract already carries the hook. `setVerifier(verifier, pcrs)` installs an attestation verifier and the expected enclave measurements; after that, the owner can no longer rotate the poster by hand. `registerEnclaveKey(attestation)` is permissionless: anyone who can present a valid attestation for the published image can install its key as the poster. If the operator disappears, anyone can stand up a replacement enclave and take over posting. Once an enclave is posting, `renounceOwnership()` leaves the organism with no operator at all.

The intended deployment is Marlin Oyster, with a reproducible Nix build and published measurements, and a Nitro attestation verifier ported to Robinhood Chain. Nobody on Robinhood Chain has an attestation verifier deployed today. The transition will be verified across: the replay must pass before, during and after the handover.

### 10. What this is not

- **Not an AI.** No model, no training, no prompt. It is a 1986 wiring diagram executed deterministically.
- **Not a trading signal.** The organism's heading carries no information about where the price goes.
- **Not a mascot with a random number generator.** Every state is a pure function of public data and can be reproduced.
- **Not a Robinhood or Chainlink product.** It runs on their infrastructure. Credit is not endorsement, and the same applies to nematoduino and OpenWorm, whose work this is built on.
- **Not controlled by a token.** Any token associated with the project does not feed, steer or change the organism.

### 11. Limitations and honest caveats

- The model is nematoduino's simplification of the connectome, not a biophysical simulation. It reproduces a reference implementation, not an animal.
- The stimulus mapping (basis points to ticks, eight-to-two food-to-touch) is a design choice. It is public and frozen, not derived from biology.
- Rounds that land between poster runs are skipped by design; the organism eats the latest round it sees. The record is still complete for everything it did eat.
- Robinhood Chain testnet has no Chainlink equity feeds, so the testnet rehearsal feeds the organism from a mirror contract filled with real mainnet rounds, ids and answers intact. The mainnet organism eats the real feed directly.
- Until v2, a reader trusts that the operator runs the published code at posting time. Everything else is checkable today.

### 12. Deployment record

| | Testnet (current) |
|---|---|
| Chain | Robinhood Chain Testnet, id 46630 |
| WetwareState | `0x395E2b16354918e9aA3c9382E42E9de33Efb7EDe` |
| Feed | `0x0D9858cAaeabbe85a82C57d47F43bb5B78199a1A` (mirror of mainnet NVDA/USD) |
| Deploy block | 114 823 883 |
| Genesis round | 18446744073709552600 |
| Genesis hash (tick 6) | `0xfc79bfa5b78aded13e7c3394024c0581303c977cd4eba85d84981065ad5ac6e0` |

The mainnet deployment will be recorded here with its own genesis when it happens.

### 13. License and credit

WETWARE is released under GPL-2.0-or-later. The simulator is forked from nematoduino by nategri [3]; the connectome is from the OpenWorm project [2]; the connectome itself is the work of White, Southgate, Thomson and Brenner [1]. The repository must stay open source: the verification claim depends on it.

### References

1. White, J. G., Southgate, E., Thomson, J. N., Brenner, S. (1986). The structure of the nervous system of the nematode *Caenorhabditis elegans*. *Philosophical Transactions of the Royal Society B*, 314(1165), 1–340.
2. OpenWorm project. https://openworm.org
3. nategri. nematoduino: an Arduino UNO-compatible robotic simulation of the *C. elegans* nematode. https://github.com/nategri/nematoduino
4. Chainlink Data Feeds documentation. https://docs.chain.link/data-feeds
5. Robinhood Chain documentation. https://docs.robinhood.com/chain
6. Source, verifier and live site: https://github.com/prjx283-lgtm/wetware
