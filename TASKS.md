# Work queue

For Claude Code. Read `CLAUDE.md` first; its hard rules override anything here.

Tasks are ordered. Each has a **Definition of done** that must actually be
demonstrated, not asserted. If you cannot demonstrate it, say so plainly rather
than marking it complete.

Steps marked **[user]** require a private key or a funded wallet. Do not attempt
them. Print the exact command for the user to run, and wait.

---

## Task 1 — Get the worm alive on testnet

**Goal:** a WetwareState contract deployed on Robinhood Chain testnet with the
poster feeding it, and `npm run verify` passing against it.

1. Confirm the environment: `node -v` (need 22+), then run all three test suites
   from CLAUDE.md. Do not proceed if any fail.
2. **[user]** Generate the poster wallet: `npm run newwallet`. Tell the user to
   save the key privately and fund the address at
   `https://faucet.testnet.chain.robinhood.com/`.
3. **[user]** `export DEPLOYER_PRIVATE_KEY=...` and
   `NETWORK=testnet FEED=NVDA npm run deploy`, then export the printed
   `STATE_ADDRESS`.
4. Read the deployed contract back over RPC and confirm `feed()` returns the
   NVDA aggregator and `poster()` returns the expected address. Report both.
5. **[user]** Start the poster: `NETWORK=testnet FEED=NVDA npm run poster`.
6. After several rounds have landed, run `NETWORK=testnet npm run verify`.

**Definition of done:** `verify` prints `VERIFIED: N states replay exactly` with
N of at least 5, and you quote the final state hash and the explorer link.

**Note:** if the US market is closed the feed will not advance and no states
will be recorded. That is correct behaviour. Say so rather than debugging it.

---

## Task 2 — The live site

**Goal:** a page where the visitor's own browser runs the worm and checks it
against the chain in real time.

This is the most important remaining piece. The verification claim currently
requires a terminal; this makes it something anyone can see happen.

**Build:**

- Import the simulator from `packages/core` **unchanged**. Do not fork it, do
  not write a second implementation. One core, three consumers. If something in
  core does not work in a browser, fix core so it does, and re-run all tests.
- Read `WetwareStateUpdated` events and the Chainlink feed directly from the
  browser over the public RPC. No backend.
- Replay from genesis in a Web Worker so the page does not freeze, then follow
  live.
- Show, prominently and honestly:
  - the worm crawling, as an animated trail of its real recorded positions
  - the current stock price and how hard it is stimulating the nervous system
  - a neuron activity view: 299 cells, lit by state value
  - a verification badge with three states: **verifying**, **verified — your
    browser re-ran every tick and got the same answer**, and **divergence at
    tick N**, which must be loud and impossible to miss
  - a poke button wired to `poke()`, with the cooldown shown
  - "the market is closed, the worm is asleep" when the feed is stale

**Rules:** the divergence state must never be silently swallowed. If the replay
disagrees with the chain, the page says so in the largest text on it. A
verification badge that cannot fail is a lie.

**Definition of done:** running locally, replaying real testnet data, badge
green. Then deliberately corrupt one expected hash in a local test fixture and
show the badge going red. Screenshot both.

---

## Task 3 — Keep it alive

**Goal:** the poster runs somewhere that is not the user's laptop.

DeepWorm died because its enclave ran out of gas in January 2025 and nobody
noticed for eighteen months. This task is the difference between a project and
a post-mortem.

- Dockerize the poster. Small image, no dev dependencies.
- Deploy to Fly.io (the user has `flyctl` installed). One machine, always on,
  restart on failure.
- **[user]** the poster key goes in as a Fly secret, set by the user. Never by you.
- Add a `/health` endpoint returning last posted round, seconds since last post,
  poster balance, and whether the feed is stale.
- Add a gas alarm: when the poster's balance drops below a threshold, log loudly
  and expose it on `/health`. Wire it to something the user actually reads.

**Definition of done:** the machine survives a forced restart and resumes from
the correct tick, proven by `verify` still passing afterwards.

---

## Task 4 — Publish the proof

**Goal:** make verification something a skeptic does in one command.

- A `VERIFY.md` a non-developer can follow: clone, install, one command.
- Pin the exact contract address, genesis round and expected constants in it.
- A GitHub Action that runs `verify` against mainnet on a schedule and fails
  loudly on divergence. A red badge on the repo is worth more than any thread.

**Definition of done:** a stranger with Node installed can verify the organism
in under five minutes, following only that file.

---

## Task 5 — v2, the TEE

**Goal:** remove the last thing a reader has to trust.

Currently a reader trusts that the operator runs the published code. A TEE
removes that. Nobody on Robinhood Chain has an attestation verifier deployed, so
this is genuinely novel there and worth a real announcement.

- Package the poster for Marlin Oyster. Reproducible build via Nix; publish PCRs.
- Port Marlin's Nitro attestation verifier to Robinhood Chain and deploy it.
  Note the split: Oyster is booked and paid on **Arbitrum One**, while the
  enclave's own transactions can target chain 4663.
- Wire `setVerifier(verifier, pcrs)`, then `registerEnclaveKey(attestation)`.
- Once the enclave is posting, `renounceOwnership()` so the organism has no
  operator at all.

**Do not start this** until Tasks 1 through 4 are done and the worm has run
without intervention for a couple of weeks. It is the reward, not the warm-up.

**Definition of done:** an enclave key registered by attestation, the operator
key no longer able to post, ownership renounced, and `verify` still passing
across the transition.

---

## Not in scope

- Anything touching the token launch. That happens on o1 and the user does it.
- Price predictions, trading logic, or anything that reads as financial advice.
- Changing what the worm is. It is 299 neurons from the OpenWorm connectome
  eating a stock price. Features that dilute that are not features.
