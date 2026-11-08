# Daykeeper

**A public treasury whose daily keeper is chosen by continuous auction, and whose power
arrives as a scoped NEAR access key that the contract mints on itself and deletes when the
day ends.** The key can speak and give. It cannot take.

- Treasury (testnet): `commons.dk-dave.testnet`
- Take the seat from a browser, no install: **https://daykeeper-tau.vercel.app/act**
- Recorded run, every transaction linked: [`docs/demo-run.md`](docs/demo-run.md)
- Product review and the reasoning behind the current design: [`docs/product-review.md`](docs/product-review.md)

## The problem

A treasury shared by strangers needs someone to decide who gets the money. A multisig needs a
council, a token vote needs turnout, a grant committee needs trust — and all three hand custody
to a permanent class of approvers.

Daykeeper replaces the approvers with a clock and a market. Each round, the right to run the
treasury for one day is sold to the highest bidder. That person receives two keys on the
treasury account: one may call `grant`, one may call `say`. Neither can attach NEAR, so neither
can move the principal. Both die at the deadline, because every privileged method re-checks
`block_timestamp` — not because a job deletes them.

## Why anyone bids

The grant is an **absolute amount fixed at launch**, not a percentage of the pool:

```
you bid 0.20 NEAR   →  you may hand out 1.00 NEAR today, to anyone but yourself
```

That gap is the product. It is a charity-auction dynamic: you are buying the right to be the
one who gives, in public, on a permanent record. The pool does not drain — one capped grant
leaves per round and bids keep refilling it.

## What a keeper can and cannot do

| Attempt | Result | Enforced by |
|---|---|---|
| speak as the treasury | ✅ | voice key scoped to `say` |
| answer one ask, up to `give` | ✅ | grant key scoped to `grant`, one per round |
| grant a second time in the same day | ❌ | `keeper_grants_left` |
| give more than `give` | ❌ impossible | the amount is `min(give, pool)`, fixed at launch |
| name themselves as the recipient | ❌ | `recipient != keeper` |
| fund an ask but pay someone else | ❌ | the ask's asker must be the recipient |
| call `grant` with the voice key | ❌ | key scope |
| transfer NEAR out | ❌ impossible | a function-call key cannot attach NEAR |
| act one second after the deadline | ❌ | `block_timestamp` check in every method |
| keep acting after the day ends | ❌ | the key is deleted at the next `settle` |

The recorded run refuses six of these against a live treasury and prints the chain's own
sentence for each — e.g. `Smart contract panicked: the keeper cannot name themselves`.

## The queue: what the money is for

Anyone may post an **ask** (one line + an amount) for a fee of 0.01 NEAR. The fee is not a
toll: it goes into the pool the ask is asking, so the queue funds the treasury it addresses.
The keeper answers one ask per day, and the grant records which ask it answered.

This is why the seat is worth holding: not "fund anyone", but "choose, today, out of what
people actually asked for".

## Demo video

Two minutes, screen-recorded from the live deployment, narrated: the pool, a browser taking the
seat with client-minted keys, the clock running out, the bell, the keys installed on the treasury,
and the chain refusing the keeper's attempt to pay itself.

`docs/daykeeper-demo.mp4` — rendered from [`open-video-demo`](https://github.com/PhiBao/open-video-demo);
the story and scene list live in that repo under `videos/daykeeper/`.

## Try it

Hosted, no install: **https://daykeeper-tau.vercel.app/act**

1. Mint your two keys in the page (the private halves never leave the browser).
2. Ask the demo faucet for a funded testnet account — or paste your own throwaway key.
3. Bid. If you are outbid, the contract refunds you in the same transaction.
4. When the round ends, ring the bell (permissionless). If you won, your keys are installed.
5. Speak as the treasury, answer an ask, then press **send the pool to myself** and watch the
   chain refuse you with its own error text.

From a terminal, the same path:

```bash
pnpm install
node scripts/state.mjs                                  # the whole ledger + installed keys
node scripts/ask.mjs dk-erin.testnet "bus fare" 0.3     # post an ask (0.01 NEAR fee → pool)
node scripts/bid.mjs dk-alice.testnet 0.2               # mints your two keys locally
node scripts/settle.mjs                                 # anyone, once the round is over
node scripts/say.mjs .keeper-voice-dk-alice.testnet "…"  # signed as the treasury
node scripts/grant.mjs .keeper-grant-dk-alice.testnet --ask 1 "…"
node scripts/refuse.mjs .keeper-grant-dk-alice.testnet .keeper-voice-dk-alice.testnet
node scripts/demo.mjs                                   # the whole story; exits non-zero on any deviation
node scripts/keeper-agent.mjs                           # a keeper that is not a person
node scripts/verify.mjs                                 # 12 invariant checks against the live chain; exit 0
```

## Architecture

```
                    ┌───────────────────────────────────────────────┐
  anyone            │  commons.dk-dave.testnet (Rust / near-sdk 5)  │
    │  request()    │                                               │
    ├──────────────▶│  ask queue ← fees feed the pool               │
    │  donate()     │                                               │
    ├──────────────▶│  bid()    → refunds the outbid bidder         │
    │  bid()        │  settle() → ANYONE: revoke keys, install new  │
    ├──────────────▶│  grant()  → one, ≤ give, never to the keeper  │
    │               │  say()    → gated on signer_account_pk()      │
    │               └──────┬───────────────────────┬────────────────┘
    │                      │ add_access_key(self)  │ delete_key(self)
    │              ┌───────▼───────────────────────▼────────────────┐
    │              │ two scoped keys, 0.25 NEAR gas allowance each  │
    │              └───────┬───────────────────────┬────────────────┘
    │                      │ grant key             │ voice key
    │              ┌───────▼────────┐      ┌───────▼──────────────┐
    └─ the record ─│ pay the asker  │      │ speak as the treasury │
                   └────────────────┘      └──────────────────────┘
```

No backend, no cron, no keeper service. `contract/` is one Rust file with no setters; `scripts/`
is the auditable CLI; `web/` is a Next.js page that reads the contract directly over public RPC
and can sign in the browser.

## Verification

- `node scripts/verify.mjs` → **12 checks against the live chain**, exit 0. Re-reads the
  contract, the account's installed key scopes and the whole grant history, and fails if any
  claim in this README does not hold.
- `cargo test --target x86_64-unknown-linux-gnu` → **18 tests**, each refusal asserted verbatim.
- `node scripts/demo.mjs` → **exit 0**, and prints a linked transaction for every claim. If any
  expected refusal is not refused, or a key is not installed, or the grant moves the wrong
  amount, it exits non-zero.
- `node scripts/state.mjs` → `view_access_key_list` on the treasury showing exactly the two
  scopes the contract installed.
- Read the recorded run: [`docs/demo-run.md`](docs/demo-run.md).

## What is real and what is not

**Real, on testnet, with hashes:** the auction and same-transaction refunds; the handover of two
scoped keys; the keeper speaking and answering an ask with no NEAR of their own; six refusals;
the deadline deleting both keys; a keeper account created by the in-page faucet and driven
entirely from a browser.

**Deliberately constrained:** launch parameters are immutable — changing the round length or
`give` means a new deployment, because a treasury with an admin key is a treasury with an admin.
Rounds are 30 seconds here so a judge can watch one end; a day on mainnet.

**Not built:** the voice writes to contract state. On mainnet the same key shape points at
near.social's `social` account, which does not exist on testnet — a mainnet seam, not a claim.
Sputnik DAO / Trezu integration is the obvious next step and is not done. Wallet-connect bidding
is not wired: the page signs locally with a key you control, which needs no extension.

## Two hard-won details

- **Identity is the signing key.** A keeper's key lives on the *treasury* account, so
  `predecessor_account_id` is always the treasury. Every privileged method compares
  `env::signer_account_pk()` against the exact key the contract issued. A predecessor check
  compiles, looks right, and can never pass.
- **Build with `--cfg near` or your error messages disappear.** `near-sdk-env` only compiles its
  host panic path for `all(near, target_arch = "wasm32")`; `cargo near build` sets that flag and
  a plain `cargo build` does not. Without it every failed `require!` reaches the chain as
  `WebAssembly trap: An 'unreachable' opcode was executed` and the reasons — the whole argument
  of this contract — are invisible. `contract/.cargo/config.toml` sets it for the wasm target.

## Where this sits in the field

Three strong entries in this track put graded authority over a DAO treasury: **Petty Cash**
(budgets with rules inside a Sputnik DAO), **Patch Fund** (tiered payouts by earned trust) and
**Potluck** (allowances = reputation × unit, endorsements pay rewards). All three decide *how
much* someone may spend, by rules.

Daykeeper decides *who holds the authority, what it costs, and when it ends* — and the ending is
not a policy, it is a key the chain deletes. The auction is the allocation mechanism, the day is
the term limit, and the scope is enforced by the protocol rather than by an `if` in a contract.
