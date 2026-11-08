# Daykeeper — the recorded run

Contract: `commons.dk-dave.testnet` (testnet) · 2026-11-08T17:25:58.670Z

Every line with a link is a real transaction. This script exits non-zero if any expected
result does not happen, so `node scripts/demo.mjs` is itself the claim.

## 1. A public treasury, and a public ask
Someone donates 2 NEAR → https://testnet.nearblocks.io/txns/LTmRD4YQeP33M8G7yCsZafFnRrEKt9umfvRRTZBYT1h
dk-erin.testnet asks for 0.3 NEAR → https://testnet.nearblocks.io/txns/Fi3bXqKVsygVfoPDvxFb5mMrBB97GmM97rtjBft6qrwH
dk-chen.testnet asks for 1.5 NEAR → https://testnet.nearblocks.io/txns/4r1fJ5Yb6e1mdZUoZwgXi5YRZ7Bk5LGBGmnxQCWVkPyB

Pool: **2.02 NEAR** — the two ask fees are already in it.
Open asks: 2. The keeper can give at most **1 NEAR** today.

## 2. The auction — bidding for the right to give
(waiting out round 1 so the auction starts clean)
Round open. Bidders mint two keys each, locally; only the public halves go on chain.
  dk-alice.testnet bids 0.12 NEAR → https://testnet.nearblocks.io/txns/AwhGeD6qYJcfL3SmvSV99tpdYH52hV2VNJNeUwqkgd2S
  dk-bruno.testnet bids 0.15 NEAR → https://testnet.nearblocks.io/txns/5cZ7y1B4WvKhxvaVnWzPBJzSr6bvnh2S3KtPAvoiT3pc
  → bruno's bid refunded alice automatically, in the same transaction
  dk-alice.testnet bids 0.2 NEAR → https://testnet.nearblocks.io/txns/Bg7kUDEbHfijMqLkgdDru7mCnJEcDLedRtFv4wSMZqjJ
  → alice's second bid refunded bruno

Leading: **dk-alice.testnet** at 0.2 NEAR · minimum next bid 0.22 NEAR

This is why anyone bids: 0.2 NEAR buys the right to hand out
**1 NEAR**. The grant size is fixed at launch, not a share of the pool.

Waiting for the clock (no server, no cron — the round ends because time passes)…
Round 2 is over. Anyone may ring the bell.

## 3. The handover
dk-dave — a stranger with no stake in the outcome — rings the bell → https://testnet.nearblocks.io/txns/HrSFsnfwH9RUmdLcjFQhQSPGnF3QjrgMyFkSXrGS4HMW
Keeper: **dk-alice.testnet**
Grant key installed on the treasury: `ed25519:DkkyTHAzoL1uqqxDy5vx1M14RSu5DbacyLf793qirj1T` (methods: grant)
Voice key installed on the treasury: `ed25519:FgG5ZzpNNLCa4XMAZ4HXRXcwNiJ78F9hfVnNLgSNMEwT` (methods: say)
Neither key can attach NEAR, so neither key can move the pool.

## 4. The control run — what a keeper cannot do
- refused: **keeper grants to themselves** — the seat is not self-dealing
  `Smart contract panicked: the keeper cannot name themselves`
  exact wording asserted natively in `contract/tests`: `the_keeper_cannot_grant_to_themselves`
- refused: **keeper answers an ask by paying somebody else** — the record would lie about who the money answered
  `Smart contract panicked: fund the ask by paying the account that asked`
  exact wording asserted natively in `contract/tests`: `an_ask_cannot_be_answered_by_paying_somebody_else`
- refused: **voice key calls grant** — the voice key is scoped to `say`
  `Transaction method name grant isn't allowed by the access key`
  exact wording asserted natively in `contract/tests`: `the_voice_key_cannot_grant`
- refused: **grant key calls say** — the grant key is scoped to `grant`
  `Transaction method name say isn't allowed by the access key`
  exact wording asserted natively in `contract/tests`: `the_grant_key_cannot_speak`
- refused: **voice key sends NEAR out** — a function-call key cannot attach NEAR
  `The transaction contains more then one action, but it was signed with an access key which allows transaction to apply only one specific action. To apply more then one actions TX must be signed with a `
- refused: **an outsider calls grant** — the signer key is not the keeper's grant key
  `Smart contract panicked: only the keeper's grant key may grant`
  exact wording asserted natively in `contract/tests`: `the_voice_key_cannot_grant`

**6/6 refused by the chain.**

## 5. The two powers, used with no wallet and no NEAR of the keeper's own
The keeper speaks as the treasury → https://testnet.nearblocks.io/txns/6bGAvoHRMaymYBCHVBGreuDjL4QWQZKw3zXuXAtbhHu9
The keeper answers ask #1 by paying dk-erin.testnet 1 NEAR → https://testnet.nearblocks.io/txns/H57tfjH8fMNgBygHQcb7LMdAbwBWwnvgXpq4hqRkomrD
Grants left this round: 0. Pool: 1.22 NEAR. Open asks: 1.
- refused: **a second grant in the same round**
  `Smart contract panicked: this round's grant is already spent`

## 6. The day ends and the key stops existing
The bell again → https://testnet.nearblocks.io/txns/J74tBg4gJoNFSaFj5ZCMQe999X6s1dP6x92zKKj6mX2V
Alice's keys are deleted from the treasury. Keeper: vacant · keys: none / none
Pool: 1.22 NEAR · keepers: 1 · grants: 1 · words: 1 · donors recorded: 1

- refused: **the keeper's key after the day ended**
  `Can't complete the action because access key ed25519:DkkyTHAzoL1uqqxDy5vx1M14RSu5DbacyLf793qirj1T doesn't exist`

## Result
Every claim above held: **exit 0**.

## Next: a keeper that is not a person
`node scripts/keeper-agent.mjs` takes the same seat with the same two keys, reads the
open asks, chooses one, says why, and pays it. Nothing in the contract knows the
difference — the constraints are the same for a human and a script.
