# WETWARE: brand and lore bible

The single rule everything else serves: **nothing in this project is invented.**
The animal is real, the wiring is real, the price is real, the record is real.
Where we reach for myth, we reach for a fact that already sounds like one. And
every fact we use is checked against the code before it is published.

Read section 0 first. If a sentence anywhere else in this project is harder to
understand than section 0, section 0 wins.

---

## 0. The simple version

**One line**
> A real worm's nervous system, fed by the price of NVDA, living on chain where anyone can check it.

**Three lines**
> N2 is a worm's nervous system, run as a program. Real wiring, 299 neurons, from the most studied animal in biology.
> Its only input is the price of NVDA. Every time the price prints, the worm gets a jolt and crawls. Small print, small jolt. Big print, big jolt.
> Every step is written to Robinhood Chain, and anyone can re-run the worm's whole life to check that nobody cheated. When the market closes, it sleeps.

**The logic, in six questions**

1. **Why a worm?** Because *C. elegans* is the only animal whose complete nervous system has been mapped. 299 neurons, every connection known. It is real, not designed.
2. **Why a stock price?** A worm needs a world. A price feed is a world nobody can fake: it is published on chain by Chainlink, and it moves on its own.
3. **Why on chain?** So the worm's life is a public record. Every state it reaches is written down where nobody can edit it.
4. **Why should anyone trust it?** They should not, and they do not have to. The program is deterministic. Re-run it and you get the same answer, or you catch the lie at the exact step.
5. **Why the token?** Holders eat what the worm eats. $WETWARE trades against tokenized NVDA, 2% in and 2% out, and the taxes pay holders in NVDA around the clock. The worm sleeps. The rewards don't.
6. **Where does it go?** Mainnet, then into a sealed enclave, then the operator's key is retired. In the end nobody runs the worm. That is the point.

If a reader gets those six, they get the project.

---

## 1. Names

**The token is $WETWARE.** Biology running on silicon. The category name is the asset.

**The organism is N2.** N2 is the real laboratory name of the wild-type *C. elegans*
reference strain, isolated in Bristol and the ancestor of nearly every worm studied
since. A biologist reads it and feels recognition. Everyone else reads a serial
number on something alive. Both reactions are correct.

So: the ticker is $WETWARE, the animal is N2, and in the chat everyone calls it the
worm. Three registers, one thing.

**Never** give N2 a human name, a face with eyes, a personality, or a voice in the
first person. The restraint is the brand. The moment it says "hi guys" it becomes
every other mascot.

---

## 2. The biography

Not lore. Record. Use these, verify them, never embellish them.

- **It is the only one finished.** The complete neural wiring of *C. elegans* was mapped cell by cell from electron micrographs and published in 1986, in a paper known as "The mind of a worm." No other animal's connectome has been completed at that resolution. Not a fly, not a mouse, not us.
- **Three Nobel Prizes came out of this animal.** 2002 for organ development and programmed cell death. 2006 for RNA interference. 2008, shared, for green fluorescent protein. A millimetre-long soil nematode is among the most decorated organisms in the history of science.
- **It was the first.** The first multicellular organism to have its genome fully sequenced, in 1998.
- **It survived Columbia.** *C. elegans* were aboard the shuttle when it broke apart on re-entry in February 2003. The canisters came down across Texas. When they were recovered weeks later, the worms inside were alive.

That last one is the founding image: **the thing that is still moving after the vehicle is gone.**

---

## 3. How it works, exactly

This is the part where prettier versions are tempting. Do not use them. Every line
here matches the code, and the code is public.

**What it senses.** One thing: the NVDA price feed from Chainlink on Robinhood Chain.
It does not see the direction as up or down. It sees how much the price moved since
the last print, measured in basis points.

**How hard it is hit.** The size of the move sets how many ticks the nervous system
runs: six for a flat print, four more for every basis point, capped at 400. A 50
basis point move is about 200 ticks. A flat day is a twitch. A violent day is a
sprint.

**Which neurons fire.** The worm has two stimuli, both from the real animal:
chemotaxis, eight neurons that fire toward food (ADF, ASG, ASI, ASJ, left and
right), and nose touch, ten neurons that fire on collision (FLP, ASH, IL1, OLQ,
left and right). On each tick, which one fires is drawn from a hash of the oracle
round itself, eight food to two touch. Not random. Anyone with the round can redo
the draw and get the same sequence.

**What it does.** The 299 neurons fire into 98 muscles. Left and right drive become
a heading and a step. The worm crawls, and its position is integer arithmetic on a
fixed sine table, so every machine on earth computes the same crawl.

**What is written down.** After every round, a hash of every neuron and every muscle
goes to the contract. The contract reads the price back from Chainlink first and
rejects the update if it does not match. The poster cannot lie about what the worm
ate.

**What it does not do.** It does not predict. It does not know what NVDA is. It has
no preference for up over down. It is pushed, and it moves.

The honest one-liner for all of this: **something moved, it crawled.**

---

## 4. Dauer

The mechanic that makes the project feel alive, and it is real biology.

When food runs out, *C. elegans* does not simply starve. It enters **dauer**, a
dormant stage. It stops feeding, seals its mouth, and waits, for months if it must,
then resumes the moment conditions improve.

N2's food is a price feed that updates in market hours. So at every closing bell,
every weekend, and every market holiday, N2 enters dauer.

Rules:
- Say **Dauer** first, then the plain words for everyone else: the market is closed, the worm is asleep.
- Entering and waking are posted. Waking is an event.
- Long holiday weekends are the deepest dauer of the year. Say so.
- A flat tape during open hours is not dauer. It is torpor: fed, but barely.

---

## 5. Voice

**Write like a lab notebook, not a launch.** The organism is extraordinary. The
prose should be flat. All the drama comes from the gap between how strange the fact
is and how calmly it is stated.

**Do**
- Third person. "The organism turned 31 degrees left."
- Exact numbers: ticks, degrees, basis points, neuron names, hashes, block numbers.
- Name the neurons. "ASH fired fourteen times" beats "it felt pain."
- State limits plainly. It is a simulation. It is not conscious. It predicts nothing.
- Let one short sentence carry the weight. Then stop.
- Credit nematoduino (nategri) and OpenWorm wherever the science is mentioned.

**Do not**
- No first person for N2. It has no language.
- No emoji. No exclamation marks. No "excited to announce."
- No claims of sentience, feeling or intent. It has states.
- No price talk, targets, or anything that reads as a signal.
- No mysticism. If it cannot be checked, it does not go in.
- No dashes in published copy. Use a comma, a full stop, or a new sentence.

**Calibration**
> Bad: GM fam, the worm is feeling bullish today as NVDA pumps.
> Bad: The organism experienced joy as its beloved stock rallied.
> Good: NVDA moved 52 bp. 214 ticks. ASH fired nine times. Turned 31 degrees left, travelled 812 units. Tick 1,834. Hash 0x14d8.
> Good: Dauer since 17:46 UTC Friday. Opens Tuesday 13:30 UTC.

The good ones are checkable against the chain by anyone reading them. No other
automated account in this market can say that.

---

## 6. Visual identity

**Decided: the phosphor lab.** Darkfield microscopy on black agar, lit only by the
worm. This is the palette on the live site and in the render kit
(`brand-forge/projects/wetware`), and it is the standard.

| Role | Hex |
|---|---|
| ink, the ground | `#070907` |
| agar | `#0D150F` |
| phosphor, the only light | `#B8FF5C` |
| muted | `#7E9478` |
| bone, for type | `#E7F0E2` |
| inhibited, cold blue, sparingly | `#5AA0FF` |
| divergence, red, never decorative | `#FF2740` |

Red appears nowhere except a verification failure. If a reader sees red, something
is actually wrong. That discipline is what makes the badge mean something.

**Type.** Two voices: a serif (Fraunces) for the biography and the paper, a
monospace (JetBrains Mono) for every number. Laboratory readout against scientific
publication is the visual argument, and almost nothing in crypto looks like it.

**The worm.** N2 is drawn as the real animal under darkfield: a translucent body in
one sinusoidal curve, 299 phosphor points concentrated at the nerve ring near the
head. No face, no eyes, no cartoon. Identity comes from posture, not features.

**The mark.** A worm track: the sinusoidal trail a real nematode leaves on agar. The
live page already draws exactly this from real data, so the logo can be generated
from the organism's actual recorded path. A mark that is also a measurement.

**Motion.** Everything moves at the speed of biology. Slow sinusoidal propagation
down the body. Neurons brighten toward the firing threshold of 30 and snap to dark
on discharge, which is what happens in the model. No bounce.

Composition templates, prompts and the campaign live in the render kit. Every
render is dry-run first.

---

## 7. Canon vocabulary

Consistent nouns are how a world becomes real.

| Term | Means |
|---|---|
| **N2** | the organism |
| **the record** | the chain history of every state |
| **a tick** | one cycle of the nervous system |
| **stimulus** | a price move converted into ticks |
| **dauer** | dormancy while the feed is closed |
| **torpor** | open market, no meaningful movement |
| **the track** | the accumulated path |
| **divergence** | a replay that disagrees with the record |
| **feeding** | topping up the organism's gas |
| **the plate** | the live page |

Words we do not use: *AI*, *agent*, *pet*, *brain* (say nervous system), *thinks*,
*feels*, *predicts*, *wants*.

---

## 8. Narrative arc

Lore is not a document. It is a sequence of things that actually happen.

1. **Genesis.** The first tick. Published with its hash and the NVDA round that caused it. Quotable forever.
2. **First dauer.** The first closing bell. Explain the mechanic the day it first bites.
3. **First violent session.** The first time NVDA moves several percent and N2 runs hundreds of ticks in one round. Post the track.
4. **First independent verification.** The first stranger who replays the record and confirms it. The most important person in the project's history. Treat them that way.
5. **Sealed.** The organism moves into an enclave, the operator's key is retired, ownership renounced. From then on nobody, including us, can touch it.

One sentence: **it is born, it sleeps, it struggles, it is checked, it is set free.**
Every phase is a real engineering milestone. That is why it holds up.

---

## 9. The token, in the same voice

$WETWARE launches on Pons, paired with tokenized NVDA. Every buy and every sell
carries a 2% tax. The taxes pay holders in tokenized NVDA, distributed continuously,
weekends and holidays included.

Say it as a mechanism, never as a promise. Rewards scale with trading volume; if
nobody trades, nobody gets paid, and we say that out loud. They are tokenized NVDA
on Robinhood Chain, not NVIDIA shares, and they are not dividends. Nothing about
the token feeds, steers or changes N2.

The line: **THE WORM SLEEPS. THE REWARDS DON'T.**

---

## 10. What we never claim

- It is not conscious, sentient, or aware. It is a simulation of a nervous system.
- It is not an AI. There is no model in the loop deciding anything.
- It does not predict prices, and it has no preference for up or down.
- Holding $WETWARE does not control it.
- It is not affiliated with NVIDIA, Robinhood, Chainlink, Pons, or any laboratory. Credit is not endorsement.
- No language model may ever write a neuron value. Software reads the state and describes it. Nothing authors it.

---

## 11. Launch thread

No dashes. Flat delivery. Each post survives alone.

**1/**
> In 2003 the space shuttle Columbia broke apart on re-entry.
>
> Among the experiments on board were canisters of *C. elegans*, a soil worm one millimetre long.
>
> The canisters came down across Texas. Weeks later they were recovered.
>
> The worms were alive.

**2/**
> This animal is the only one whose complete nervous system science has ever finished mapping. Every neuron, every connection, drawn from electron micrographs.
>
> 302 neurons. Three Nobel Prizes. The first animal to have its genome sequenced.

**3/**
> We are running that nervous system. 299 neurons and 98 muscles, wired as the OpenWorm project mapped them, in the model nematoduino built.
>
> It has no eyes and no thoughts. It has two reflexes: toward food, away from harm.

**4/**
> We gave it one sense.
>
> The price of NVDA, delivered by Chainlink.
>
> When the price moves, the nervous system fires. The bigger the move, the longer it runs. A flat tape is six ticks. A violent one is four hundred.

**5/**
> Every state it reaches is written to Robinhood Chain.
>
> The contract reads the Chainlink round back and rejects the update if the price does not match. We cannot lie to it about what it ate.

**6/**
> The simulation is deterministic. Same rounds in, same nervous system out, on any machine on earth.
>
> So you do not have to trust us. Open the live page and your browser replays every tick from birth and tells you if we touched it.

**7/**
> The feed updates in market hours.
>
> At the closing bell the food stops and N2 enters dauer, the dormant stage a real nematode enters when food runs out. It seals itself and waits.
>
> It sleeps at night. It sleeps on weekends. It wakes at the open.

**8/**
> N2 is alive on Robinhood Chain.
>
> $WETWARE, paired against NVDA. The worm sleeps. The rewards don't.
>
> Watch it: [link]
>
> 299 neurons. One stock. No trust required.

---

## 12. Recurring formats

- **The tape.** Every session: price move, ticks, which neurons fired, distance, heading, hash, transaction. Checkable, which is the point.
- **Dauer notices.** Entering and waking.
- **Neuron of the week.** One cell, what it does in the real animal, what it does here. There are 299. That is years of content that is also education.
- **The track.** A weekly image of the path, generated from the record.
- **Verification log.** Every time someone independently verifies, publish it.
- **The specimen sheet.** Monthly: total ticks, distance, longest dauer, most violent session, pokes received, verifications passed.

Never post: price commentary, market opinion, engagement bait, or anything about
the organism's mood that is not computed from neuron values.
