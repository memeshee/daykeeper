# Demo post for X — copy to publish

Rules this copy satisfies (from `nearhackathon.com/HACKATHON.md` §2): leads with the user
problem, shows one complete moment, says what NEAR enables and why it matters, gives a next
step, and carries `@NEARProtocol` + `#NEARHackathon`.

---

## The post (long form, for an account that can post over 280 characters)

A pot of money shared by strangers needs someone to decide who gets it. So it ends up with a
committee, and the committee keeps custody.

Daykeeper sells the decision instead. Every round, the right to run the treasury for one day goes
to the highest bidder, and the contract hands that stranger two keys on its own account: one can
give, one can speak. Neither can take, and both stop existing when the day does.

You bid 0.2 NEAR → you may hand out 1.0 NEAR today, to anyone but yourself. That gap is the whole
product.

Why it holds:

- a function-call key cannot attach NEAR, so the pool is out of reach by protocol rule, not by
  promise
- one grant a day, at a size fixed when the contract was deployed — no method can raise it
- the key dies at the deadline because every privileged method checks the clock. No cron, no
  admin, no sweeper to trust

Anyone can ask the treasury for money. Posting an ask costs 0.01 NEAR and that fee goes into the
pool it is asking. The keeper answers one a day, and the grant records which ask it answered.

Two and a half minutes of it, from a real screen: a browser mints the keys, bids 0.15, the clock
runs out, the bell gets rung, the keys install on the treasury — and then the keeper tries to pay
itself and the chain refuses in its own words.

Try it yourself, nothing to install: https://daykeeper-tau.vercel.app/act
Code: https://github.com/memeshee/daykeeper

Built at NEAR HACKATHON @NEARProtocol #NEARHackathon @NearBuilders

If you held the seat for one day, what would you fund?

---

## The post (short form, if the account is limited to 280 characters)

A shared treasury always ends up with a committee that keeps custody. Daykeeper auctions the
decision instead: one day of power, handed over as a NEAR key that can give and speak but never
take, and dies at the deadline. Bid 0.2, hand out 1.0. Take the seat:
daykeeper-tau.vercel.app/act @NEARProtocol #NEARHackathon

---

## Attach

- `docs/daykeeper-demo.mp4` — screen-recorded from the live deployment, narrated
- `docs/shot-console.png` and `docs/shot-home.png` if you prefer stills
- keep the hosted demo up past 18 Nov (rule Q-012)

## Alt text for the video

"A screen recording of Daykeeper on NEAR testnet. A browser mints two keys, gets a funded test
account, bids 0.15 NEAR, waits for the round clock to run out, rings the bell, and becomes the
keeper: the contract installs a grant key and a voice key on the treasury. The keeper then tries
to pay itself and the chain refuses with the message: the keeper cannot name themselves."

## Before posting

- [ ] `node scripts/verify.mjs` exits 0 and prints 12/12
- [ ] the live URL answers 200 and the console reaches "the seat is yours"
- [ ] the post carries `@NEARProtocol` and `#NEARHackathon`
- [ ] paste the post URL into the submission payload (`demoUrl`)
