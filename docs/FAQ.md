# WETWARE — Frequently asked questions

**Is it an AI?**
No. There is no model, no training and no prompt. It is the 1986 *C. elegans* wiring diagram, as simplified by nematoduino, executed deterministically. Same input, same output, every time, on every machine.

**Is it alive?**
It is a simulation of a nervous system, not an animal. It senses, it crawls, it sleeps. It does not want anything. We say "the worm" because it is one; we do not claim more than the biology supports.

**Does it predict NVDA?**
No. The organism's heading carries no information about where the price goes. It reacts to the size of a move after it happens. Anyone reading a signal in the crawl is on their own.

**Why NVDA?**
It needed one liquid tokenized equity with a Chainlink feed on Robinhood Chain, and one is all it can eat: the feed address is immutable in the contract. A different stock is a different organism with its own genesis.

**Why Robinhood Chain?**
Because that is where Chainlink publishes price feeds for tokenized equities, the feeds are on chain and readable by a contract, and blocks are fast and cheap enough to record a state per round.

**What happens when the market closes?**
The feed stops updating, the worm earns no ticks and stops moving. The site says "the market is closed, the worm is asleep." That is correct behaviour, not a fault.

**How do I know the operator isn't faking it?**
You don't have to know. The contract re-reads the price from Chainlink before accepting a state, and the simulator is deterministic, so you can replay every state from genesis and compare hashes. `VERIFY.md` is one command. The site does it in your browser. If it disagrees with the chain, it says so in the largest text on the page.

**What do I have to trust, then?**
In v1, one thing: that the operator runs the published code at the moment it posts. v2 removes that by running the poster inside an attested enclave and renouncing ownership.

**What if the operator disappears?**
The organism is rebuilt entirely from public data, so anyone can run the same poster and take over. In v2 that takeover is permissionless: any valid enclave attestation can register a new poster key.

**What is a poke?**
A transaction anyone can send to the contract. It is counted, has a 60-second cooldown, and does nothing for you. In v1 the organism does not react to pokes; making it react changes the state hash inputs and will be decided before mainnet genesis, not after.

**Why did the last worm die?**
DeepWorm's enclave ran out of gas in January 2025 and nobody noticed for eighteen months. WETWARE has a gas alarm wired to a phone, a health endpoint, and a public run log.

**Can I run it myself?**
Yes. Clone the repo, `npm ci`, `npm run verify` to check the chain, `npm run simulate 200` to run the organism offline, `npm run site` for the visualiser. The offline run must end with hash `0x0f823b06…4719` on any machine.

**What does the token do?**
Nothing to the worm. It does not feed it, steer it or change it. The token is a separate event and any claim otherwise is false.

**Is Robinhood, Chainlink or OpenWorm involved?**
No. WETWARE runs on Robinhood Chain and reads Chainlink feeds; the simulator is forked from nematoduino and the connectome comes from OpenWorm. Credit is not endorsement.

**What is the license?**
GPL-2.0-or-later, inherited from nematoduino. The repository must stay open; the verification claim depends on it.
