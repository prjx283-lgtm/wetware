# Verify the worm yourself

You need Node 22 or newer and about five minutes. Nothing else. No wallet, no
key, no account.

What you are checking: the organism recorded on Robinhood Chain is exactly
what the published simulator produces from the public oracle rounds, tick for
tick, hash for hash. If the operator ever ran different code, or edited a
state, this command says so and names the round.

## One command

```bash
git clone https://github.com/prjx283-lgtm/wetware.git && cd wetware && npm ci
NETWORK=testnet FEED=NVDA \
FEED_ADDRESS=0x0D9858cAaeabbe85a82C57d47F43bb5B78199a1A \
STATE_ADDRESS=0x395E2b16354918e9aA3c9382E42E9de33Efb7EDe \
FROM_BLOCK=114823883 \
npm run verify
```

You should see, with a larger number as time passes:

```
VERIFIED: 11 states replay exactly.
final hash 0x...
```

If you instead see `DIVERGENCE at tick N`, the organism on chain is not the
published one. Please say so, loudly, and link the transaction it prints.

## What is pinned

| | Value |
|---|---|
| Chain | Robinhood Chain Testnet, id 46630, `https://rpc.testnet.chain.robinhood.com` |
| WetwareState | `0x395E2b16354918e9aA3c9382E42E9de33Efb7EDe` |
| Feed | `0x0D9858cAaeabbe85a82C57d47F43bb5B78199a1A` (a MockAggregator mirroring the mainnet NVDA feed; testnet has no Chainlink equity feeds) |
| Deploy block | 114823883 |
| Genesis round | 18446744073709552600 |
| Genesis state hash, tick 6 | `0xfc79bfa5b78aded13e7c3394024c0581303c977cd4eba85d84981065ad5ac6e0` |

Consensus constants, in `packages/core/src/organism.ts`. If any of these differ
in the code you cloned, the replay will not match, and that is the point:

| Constant | Value |
|---|---|
| BASE_TICKS | 6 |
| TICKS_PER_BP | 4 |
| MAX_TICKS | 400 |
| CHEMOTAXIS_WEIGHT | 8 |
| TURN_DIVISOR | 2 |
| SPEED_DIVISOR | 16 |

Simulator self-check, independent of the chain: `npm run simulate 200` must
end with state hash
`0x0f823b06ce057affa4f28cb744fb1fb0931e90db927a926398aadbffe06a4719`.

## What this does and does not prove

It proves the recorded states are what the open-source simulator produces
from the oracle rounds the contract itself re-read from Chainlink. It does
not prove the operator's machine is running this code at the moment it posts;
in v1 that is the one thing you take on trust, and it is what the TEE in v2
removes. It also does not prove anything about NVDA. The worm does not care
where the price goes, only that it moved.

## In the browser

`npm run site` and open `http://localhost:8787`. The same replay runs in a Web
Worker in your browser and shows the badge going green, or red.

## Mainnet

When the organism is on mainnet this file will pin the mainnet address, feed
and deploy block instead, and the GitHub Action in `.github/workflows` runs
this verification on a schedule. A red badge on the repository means
divergence.
