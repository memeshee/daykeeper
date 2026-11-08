# Daykeeper — demo run

Contract: `commons.dk-dave.testnet` (testnet) · 2026-11-08T14:56:54.691Z

## 1. A treasury that only grows
Someone donated 2 NEAR → https://testnet.nearblocks.io/txns/AWyQPmC9QB5dmMRyJy5ikqTY86df9P3wWF5fshD7Edr1
Pool: **2 NEAR**. Grant cap this round: 0.1 NEAR.

## 2. The auction for the next day
Round open. Three bidders, each minting two keys locally.
  dk-alice.testnet bids 0.5 NEAR → https://testnet.nearblocks.io/txns/HyEkVeZng7ybCDxQZiW7cY2ms6m3eftwJhJdC6Em6QjC
  dk-bruno.testnet bids 0.7 NEAR → https://testnet.nearblocks.io/txns/9kfKrYbm82k9VQLZweWKSu6h3ARjXyWJc9gqjkhpG5ZG
  → bruno's bid refunded alice automatically, in the same transaction
  dk-alice.testnet bids 1.2 NEAR → https://testnet.nearblocks.io/txns/23cmWga2NhJepF3fTuAvCUYrGMPyZs8h9tvYGUU6UHyz
  → alice's second bid refunded bruno

Leading: **dk-alice.testnet** at 1.2 NEAR · minimum next bid 1.32 NEAR

Waiting for the round to end (this is the clock doing the work, not a server)…
Round 2 is over. Anyone may ring the bell.

## 3. The handover
dk-dave (a stranger with no stake) rings the bell → https://testnet.nearblocks.io/txns/HDH876r7WfkjXKherdGrpesNCgy3jmmqL4oTeoBBSK1Z
Keeper: **dk-alice.testnet**
Grant key installed on the treasury: `ed25519:AaumrFjeJefRLbei6W3oyqHPL8fTqi4T1CWECqGSJ7Sx` (methods: grant)
Voice key installed on the treasury: `ed25519:CjRnM2ziU7DJrdvwfDjsdVYbAwdaJxyu5631bGEJA6eo` (methods: say)
Neither key can attach NEAR, so neither can move the pool.

## 4. The two powers, used with no wallet and no NEAR
The keeper speaks as the treasury → https://testnet.nearblocks.io/txns/HtT6ChsDCcRwfThL2mUNaGgcjy7qva4CCXV1Logfd7mi
The keeper grants 0.16 NEAR to dk-erin.testnet (never used Daykeeper) → https://testnet.nearblocks.io/txns/2YNb2Mb2ZfP4cVpB8LsPNaDTFkXsYBpuqxfgXafAAFyK
Grants left this round: 0. Pool is now 3.04 NEAR.

## 5. The control run — five things a keeper must not be able to do
- refused: **voice key calls grant** — the voice key is scoped to `say`
  `Transaction method name grant isn't allowed by the access key`
- refused: **grant key calls say** — the grant key is scoped to `grant`
  `Transaction method name say isn't allowed by the access key`
- refused: **voice key sends NEAR out** — function-call keys cannot attach NEAR
  `The transaction contains more then one action, but it was signed with an access key which allows transaction to apply only one specific action. To apply more th`
- refused: **grant key calls donate** — only the scoped method name is allowed
  `{}` (the SDK returns an empty ActionError here; the same scope rule refused it, and
  `refuse.mjs` now digs the real sentence out of the error kind)
- refused: **outsider calls grant** — the signer key is not the keeper's grant key
  `{"index":0,"kind":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"WebAssembly trap: An `unreachable` opcode was executed."}}}}`

**5/5 refused by the chain.**

## 6. The day ends
The bell again → https://testnet.nearblocks.io/txns/6LX6oL4UZDFLSzfLccM82staLpjfKgZKSrdeWNqxraXf
Alice's keys are deleted from the treasury. Keeper now: vacant · keys: none / none
Pool: 3.04 NEAR · keepers so far: 1 · grants: 1 · words: 1

---

*Annotation corrected after the run: the contract decides identity from the signing key (`env::signer_account_pk()`), not from the predecessor account, so the fifth line above originally mislabelled the refusal. Every transaction hash is untouched.*
