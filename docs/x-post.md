# Demo post for X — draft for kiter to publish

Rules this draft satisfies (from `nearhackathon.com/HACKATHON.md` §2): leads with the user
problem, shows one complete moment, says what NEAR enables and why it matters, gives a next
step, and carries `@NEARProtocol` + `#NEARHackathon`.

---

A treasury shared by strangers normally needs a committee. We replaced the committee with a clock.

Daykeeper: one public NEAR treasury. Every round, the right to run it for a day goes to the
highest bidder — and the contract hands that stranger a key that can give money away and speak
as the treasury, but can never take a single yocto.

The keeper doesn't have to be trusted:

• one grant per day, capped by parameters fixed at launch — no method can raise them
• the key is a function-call key, so it cannot attach NEAR: the pool is out of reach
• the key dies at the round deadline because every method checks block_timestamp. No cron, no admin

In this clip a stranger who has never held NEAR buys the seat, posts as the treasury, funds
someone who has never touched the app — then tries to drain the pool and the chain refuses, on camera.

Live on testnet: https://daykeeper-tau.vercel.app
Code: https://github.com/PhiBao/daykeeper

Built at NEAR HACKATHON @NEARProtocol #NEARHackathon @NearBuilders

Question for builders: if you held the seat for one day, what would you fund first?

---

## Attach

- the demo video (`docs/demo.mp4` when recorded) or the screenshots in `docs/`
- keep the hosted demo up past 18 Nov (rule Q-012)

## Before posting

- [ ] the live URL answers 200 and shows the clock
- [ ] the repo is public
- [ ] the post carries `@NEARProtocol` and `#NEARHackathon`
- [ ] copy the post URL into the submission payload (`demoUrl`)
