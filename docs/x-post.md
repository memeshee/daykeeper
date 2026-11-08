# Demo post for X — draft for kiter to publish

Rules this draft satisfies (from `nearhackathon.com/HACKATHON.md` §2): leads with the user
problem, shows one complete moment, says what NEAR enables and why it matters, gives a next
step, and carries `@NEARProtocol` + `#NEARHackathon`.

---

A shared pot of money needs someone to decide who gets it. So it ends up with a committee — and
the committee keeps custody.

Daykeeper sells the decision instead. Every round, the right to run the treasury for one day goes
to the highest bidder, and the contract hands that stranger two keys on its own account: one can
give, one can speak. Neither can take, and both stop existing when the day does.

You bid 0.2 NEAR → you may hand out 1.0 NEAR today, to anyone but yourself.
That gap is the whole product.

Why it actually holds:

· a function-call key cannot attach NEAR, so the pool is out of reach by protocol rule, not by
  promise
· one grant per day, at a size fixed when the contract was deployed — no method can raise it
· the key dies at the deadline because every privileged method checks block_timestamp. No cron,
  no admin, no sweeper to trust

Anyone can ask the treasury for money. Posting an ask costs 0.01 NEAR and that fee goes into the
pool it is asking. The keeper answers one ask a day, and the grant records which ask it answered.

Try it in a browser, nothing to install: mint your own keys, take a funded testnet account, bid,
ring the bell, speak as the treasury — then press "send the pool to myself" and watch the chain
refuse you in its own words.

https://daykeeper-tau.vercel.app/act
https://github.com/PhiBao/daykeeper

Built at NEAR HACKATHON @NEARProtocol #NEARHackathon @NearBuilders

If you held the seat for one day, what would you fund?

---

## Attach

- the 2-minute demo video (`docs/daykeeper-demo.mp4`, also in `open-video-demo/videos/daykeeper/out/`)
- `docs/shot-console.png` and `docs/shot-home.png` if you prefer stills
- keep the hosted demo up past 18 Nov (rule Q-012)

## Alt text for the video

"A screen recording of Daykeeper on NEAR testnet. A browser mints two keys, gets a funded test
account, bids 0.15 NEAR, waits for the round clock to run out, rings the bell, and becomes the
keeper: the contract installs a grant key and a voice key on the treasury. The keeper then tries
to pay itself and the chain refuses with the message: the keeper cannot name themselves."

## Before posting

- [ ] `node scripts/verify.mjs` exits 0
- [ ] the live URL answers 200 and the console reaches "the seat is yours"
- [ ] the post carries `@NEARProtocol` and `#NEARHackathon`
- [ ] copy the post URL into the submission payload (`demoUrl`)
