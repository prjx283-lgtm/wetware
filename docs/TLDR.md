# WETWARE, in one page

**A real worm's nervous system, fed by the price of NVDA, living on chain where anyone can check it.**

N2 is a worm's nervous system, run as a program. Its only input is the price of NVDA.
Every time the price prints, the worm gets a jolt and crawls. Small print, small jolt.
Big print, big jolt. Every step is written to Robinhood Chain, and anyone can re-run
the worm's whole life to check that nobody cheated. When the market closes, it sleeps.

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

An organism that nobody monitors stops without an announcement, and the record simply ends.
So this one restores itself from the chain on every start, refuses to run if history does not
reproduce, exposes a health endpoint, and rings a phone when the balance gets low. Every run
is public. Silence is a symptom, and it is visible.

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
