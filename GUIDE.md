# WETWARE: the whole thing, step by step

No prior coding needed. Type the commands exactly as written. Every step tells
you what you should see, so you always know whether it worked.

Total time: about 40 minutes to a live worm on testnet.

---

## Part 0: Open the Terminal

Terminal is the black window where you type commands. On your Mac:

1. Press `Cmd` + `Space`
2. Type `terminal`
3. Press `Enter`

A window opens with a blinking cursor. That is it. That is the whole tool.

Now go into the project folder. Copy this line, paste it, press `Enter`:

```bash
cd ~/Projects/wetware
```

Nothing visible happens. That is correct. You are now "inside" the folder.

> **If it says "no such file or directory"** the folder is somewhere else. Run
> `ls ~/Projects` to see what is actually there.

---

## Part 1: Check the worm is real

Before trusting anything, make the code prove itself.

```bash
npm run test:core
```

Wait a few seconds. Near the bottom you want:

```
# pass 13
# fail 0
```

Then:

```bash
npm run test:contracts
```

You want:

```
# pass 8
# fail 0
```

**What just happened:** 21 automated checks ran. They confirmed the worm's brain
behaves correctly, and that the smart contract refuses to accept a fake price.
If both say `fail 0`, everything is healthy.

---

## Part 2: Watch the worm move

This runs the worm on fake price data. No internet, no money, no risk. Just to
see it breathe.

```bash
npm run simulate 200
```

You get a table, then a summary like:

```
rounds          200
total ticks     17542
stimulus mix    14044 chemotaxis / 3498 nose touch (80.1% food)
final position  (588, -1064)
track           3152 x 2931 units (aspect 1.08)
state hash      0x0f823b06...
```

**How to read it:**

- **ticks**: how many times the nervous system fired. More price movement, more ticks.
- **stimulus mix**: 80% food, 20% pain. That is the worm's world.
- **track**: the size of the area it crawled. Aspect near 1.0 means it wandered
  in both directions like a real worm instead of walking in a straight line.
- **state hash**: a fingerprint of the worm's entire nervous system. This is the
  number that makes the project honest. Anyone re-running the same prices gets
  the same fingerprint, or somebody cheated.

Run it again with a bigger number, `npm run simulate 1000`, and watch it travel
further.

---

## Part 3: Make a wallet for the worm

The worm needs its own wallet to sign its movements. This is **not** your
personal wallet. It holds a few dollars of gas and nothing else.

```bash
npm run newwallet
```

You get:

```
  ADDRESS       0x1234...
  PRIVATE KEY   0xabcd...
```

**Do this now:**

1. Copy both lines into a note only you can see. A password manager is ideal.
2. Never paste the private key into a chat, a website, a screenshot, or a
   Discord DM. Anyone with it controls that wallet.
3. Never put real money in this wallet beyond gas.

Now tell the terminal about the key. Replace `0xabcd...` with your actual key:

```bash
export DEPLOYER_PRIVATE_KEY=0xabcd...
export POSTER_PRIVATE_KEY=0xabcd...
```

> **Important:** these only last while this terminal window is open. If you close
> it, you have to type them again. That is a safety feature, not a bug.

---

## Part 4: Get free test money

Testnet is a practice version of the blockchain where the money is fake. Always
practise here first.

1. Open <https://faucet.testnet.chain.robinhood.com/>
2. Paste the **ADDRESS** from Part 3 (the one starting `0x`, not the private key)
3. Request funds

It gives you test ETH for gas, and test tokenized stocks. Wait about a minute.

---

## Part 5: Put the worm's body on the blockchain

This creates the contract that will hold the worm's state.

> **Testnet has no real stock price feeds.** Chainlink only runs them on the
> real network. So on testnet we first create a stand-in feed, then copy the
> real NVDA prices into it. Run this once and keep the printed line:
>
> ```bash
> NETWORK=testnet npm run deploy:mock
> export FEED_ADDRESS=0x1234...        # the line it prints, copy it exactly
> ```

```bash
NETWORK=testnet FEED=NVDA npm run deploy
```

You should see:

```
deployed WetwareState at 0x5678...
export STATE_ADDRESS=0x5678...
```

**Copy that last line and run it.** It tells the next command where the worm lives:

```bash
export STATE_ADDRESS=0x5678...
```

> **If it fails with "insufficient funds"** the faucet has not arrived yet. Wait
> two minutes and try again.

---

## Part 6: Wake the worm up

```bash
NETWORK=testnet FEED=NVDA npm run poster
```

Then, **in a second terminal window**, set the same variables again (`export
FEED_ADDRESS=...`, and `export MIRROR_PRIVATE_KEY=` with the same key you used
as `DEPLOYER_PRIVATE_KEY`) and start copying real prices into the stand-in feed:

```bash
FEED=NVDA BACKFILL=10 npm run mirror
```

It writes one recent real NVDA price every 30 seconds, then follows the live
feed. The poster window will start showing rounds within a minute even if the
market is closed, because those are real prices from the last session.

Now leave this window open. Every time NVDA's price moves, you will see a line
like:

```
[wetware] round 4412 @ 178.93 (12bp) -> 54 ticks, moved (7,-3), tick 1204, hash 0x9a3f... in 0xbe21...
```

Read it as: the price moved 12 basis points, so the worm was stimulated 54
times, it crawled 7 right and 3 down, and the whole thing is now recorded on the
blockchain forever.

**If the market is closed** you will instead see:

```
[wetware] feed idle at 178.93, round 4412. The market is closed and the worm is asleep.
```

That is correct behaviour, not a failure. The price feed only updates during
trading hours, so the worm sleeps at night and on weekends. That is one of the
nicest parts of the whole idea.

To stop it, press `Ctrl` + `C`.

---

## Part 7: Prove the worm is honest

This is the step that makes the project different from every "trust me" project.

Open a **second** Terminal window (`Cmd` + `N`), then:

```bash
cd ~/Projects/wetware
export STATE_ADDRESS=0x5678...
NETWORK=testnet FEED=NVDA npm run verify
```

It downloads every movement the worm has ever recorded, re-runs the entire
nervous system from birth, and compares. You want:

```
VERIFIED: 47 states replay exactly.
```

**This is your marketing.** Anyone in the world can run that command and check
you have not touched the worm. If you ever cheated, it would print the exact
moment you did it. Put the command in your pinned post.

---

## Part 8: Go live on the real chain

Only after testnet has run for a day or two without problems.

What changes:

1. The worm's wallet needs **real ETH on Robinhood Chain** for gas. Gas is
   extremely cheap there, so a small amount lasts a long time. Bridge it in the
   normal way you move funds to that chain.
2. Every command swaps `NETWORK=testnet` for `NETWORK=mainnet`.

```bash
NETWORK=mainnet FEED=NVDA npm run deploy
export STATE_ADDRESS=0x...          # the new mainnet address
NETWORK=mainnet FEED=NVDA npm run poster
```

Then run `verify` against mainnet the same way.

### Freeze the settings before you launch

Six numbers in `packages/core/src/organism.ts` control how the worm behaves:
`BASE_TICKS`, `TICKS_PER_BP`, `MAX_TICKS`, `CHEMOTAXIS_WEIGHT`, `TURN_DIVISOR`,
`SPEED_DIVISOR`.

Changing any of them **after** launch breaks every past verification. The worm
would effectively become a different animal and `verify` would start failing for
everyone. Decide on them before mainnet, then never touch them.

---

## Part 9: Launch the token

Separate from the code, and it happens on the o1 launchpad.

1. Go to <https://launch.o1.exchange>
2. Choose a **stock-paired** launch and pick **NVDA** as the pair
3. Ticker `WETWARE`, and upload the mascot art
4. Creating costs **0.001 ETH** plus gas

Things to know before you press the button:

- Supply is fixed at **1,000,000,000** and cannot be changed or minted later.
- The whole supply goes into one Uniswap v4 position. You deposit **no NVDA
  yourself**. Opening value is about **$4,000**.
- Liquidity is **permanently locked**. You cannot pull it, and neither can anyone else.
- **First 20 seconds:** the fee starts at 99% and falls to 1%. This burns snipers.
  Do not let your community buy in that window, and say so loudly beforehand.
- **Your fees arrive in tokenized NVDA**, not in your own token. You take 50% of
  the 1% swap fee. Volume pays you in stock.
- There is no bonding curve and no graduation. It trades the second it exists.

**Have the contract deployed, the worm running, and `verify` passing before you
launch the token.** The token is the easy part. The living worm is the reason
anyone cares.

---

## Part 10: Keep it alive

DeepWorm did not get rugged. It got abandoned. Its brain stopped posting on
19 January 2025 and its wallet ran out of gas, and that is the whole story of how
a $91M project became a $56k one.

So:

- **Watch the gas.** If the worm's wallet empties, the worm dies. Set a reminder
  to top it up.
- **Run the poster somewhere that stays on.** Your laptop closing is the worm
  dying. A cheap VPS, Railway, or Fly.io is enough. You already have Fly and
  Railway installed.
- **If it crashes, just restart it.** The poster rebuilds the worm's exact
  nervous system from the price history on startup. It picks up where it left
  off rather than being born again.
- **Post the verify command** whenever anyone doubts you.

---

## When something goes wrong

| It says | It means | Do this |
|---|---|---|
| `command not found: npm` | Node is missing | Install from <https://nodejs.org> |
| `no such file or directory` | Wrong folder | `cd ~/Projects/wetware` |
| `STATE_ADDRESS is required` | Terminal forgot | Re-run the `export` lines |
| `insufficient funds` | No gas | Use the faucet, or bridge real ETH |
| `PriceMismatch` | The price did not match the oracle | This is the safety net working. Restart the poster. |
| `DIVERGENCE at tick ...` | On-chain state does not match a replay | Serious. Stop and tell me the tick number. |
| Nothing happens for hours | Market is closed | Normal. The worm sleeps. |

Closed the terminal and lost your place? You only ever need these three lines:

```bash
cd ~/Projects/wetware
export POSTER_PRIVATE_KEY=0x...
export STATE_ADDRESS=0x...
```
