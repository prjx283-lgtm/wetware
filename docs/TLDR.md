# WETWARE, in one page

**A real nervous system eating a stock price, on chain, and you can check every tick.**

## What it is

A simulated *C. elegans* worm. 299 neurons, 98 muscles, from the OpenWorm connectome, the
only fully mapped nervous system in biology. Its one sense of the outside world is the
Chainlink price feed for tokenized NVDA on Robinhood Chain.

## What it does

When the price moves, the worm is stimulated and crawls. Bigger move, more activity: six
ticks for a flat print, four more per basis point, capped at 400. Which stimulus fires on
each tick is decided by hashing the oracle round itself, so the worm's whole life is a pure
function of public data. When the market closes, the feed stops and the worm sleeps.

## Why it cannot lie

- After every round, a hash of every neuron and muscle is recorded on chain.
- The contract re-reads the price from Chainlink before accepting it. A poster cannot invent a price.
- The simulator is deterministic and open source. Anyone can replay the history from genesis and get the same hashes, or find the exact round where they don't.
- The live site does that replay in your own browser and shows one of three things: verifying, verified, or **DIVERGENCE AT TICK N** in the largest text on the page.

## Why it will not die quietly

The last on-chain worm ran out of gas in an enclave in January 2025 and nobody noticed for
eighteen months. This one restores itself from the chain on every start, refuses to run if
history does not reproduce, exposes a health endpoint, and rings a phone when the balance
gets low.

## What it is not

Not an AI. Not a trading signal. Not a Robinhood or Chainlink product. Not steered by the
token. It does not know what NVDA is.

## The token

$WETWARE trades against tokenized NVDA with a 2% buy and 2% sell tax. The taxes pay
holders in tokenized NVDA, around the clock, market open or closed. Rewards scale with
volume and are never promised. None of it reaches the worm. The worm sleeps. The rewards
don't.

## What comes next

Mainnet genesis on the real feed. Then v2: the simulator inside an attested enclave, the
operator key retired, ownership renounced. After that nobody operates the worm.

## Check it yourself

Node 22, one command, five minutes: see `VERIFY.md`. Or open the site and watch the badge.

*GPL-2.0-or-later. Forked from nematoduino (nategri). Connectome from OpenWorm.*
