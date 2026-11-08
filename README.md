# Daykeeper

**A public treasury with a new keeper every day.** The right to run the treasury is sold by
continuous auction; the winner's power arrives as a NEAR access key that the contract mints
on itself and revokes when their day ends. The key can speak and give. It cannot take.

One sentence: *you can buy the right to give a shared pot of money away for one day, and the
chain stops you from keeping any of it.*

- Treasury (testnet): `commons.dk-dave.testnet`
- Demo transcript with every transaction hash: [`docs/demo-run.md`](docs/demo-run.md)
- Built for **NEAR HACKATHON**, tracks `social` + `open`.

---

## The problem

A treasury shared by strangers has a governance problem: a multisig needs a council, a token
vote needs turnout, and a grant committee needs trust. All three take custody away from the
people and hand it to a permanent class of approvers.

Daykeeper replaces the approvers with a clock. Each day one person holds the treasury, on
terms the contract sets and cannot be talked out of:

| | |
|---|---|
| **one keeper at a time** | chosen by the highest bid in a continuous auction |
| **one grant per day** | a fixed % of the pool, set at launch, no method can raise it |
| **one voice** | the keeper can post as the treasury, forever, on the public record |
| **zero custody** | a function-call key cannot attach NEAR, so the pool is out of reach |
| **zero admin** | no owner, no setters, no pause, no upgrade path for the parameters |

The pool only grows. Bids go in, one capped grant leaves per round, and the record of who held
it and what they gave is public.

## The primitive

NEAR lets an account hold several keys, each with its own permission set. A function-call key
is pinned to **one** receiver, an optional method list, and an optional allowance — and it
**cannot attach NEAR**.

That is the whole product. At `settle()` the contract calls `add_access_key` on **its own
account** twice:

```
ed25519:GmK4…  →  receiver=commons.dk-dave.testnet  methods=[grant]  allowance=0.25 NEAR
ed25519:HHS9…  →  receiver=commons.dk-dave.testnet  methods=[say]    allowance=0.25 NEAR
```

The keeper holds the private halves; they were generated on the keeper's own machine and only
their public halves ever entered a transaction. The allowance pays the gas, so the keeper needs
no NEAR. At the end of the day the contract deletes both keys.

**Identity comes from the signing key, not the caller.** Because the keeper's key lives on the
treasury account, `predecessor_account_id` is always the treasury. Every privileged method
therefore compares `env::signer_account_pk()` against the exact key the contract issued:

```rust
require!(env::signer_account_pk() == expected, "only the keeper's grant key may grant");
```

Expiry needs no scheduler. Every privileged method re-checks `block_timestamp` against
`round_end`, so the key dies at the deadline whether or not anybody has run the cleanup.

## What a keeper can and cannot do

| Attempt | Result | Why |
|---|---|---|
| post as the treasury | ✅ allowed | voice key is scoped to `say` |
| give the capped grant once | ✅ allowed | grant key is scoped to `grant` |
| give a second grant in the same round | ❌ refused | `keeper_grants_left` is 1 |
| give more than the cap | ❌ impossible | the cap is computed from the pool at launch parameters |
| call `grant` with the voice key | ❌ refused | key is scoped to `say` |
| transfer NEAR out | ❌ impossible | function-call keys cannot attach NEAR |
| act after the round ends | ❌ refused | every method checks `block_timestamp` |
| let someone else grant | ❌ refused | signer public key must match the issued key |

## Architecture

```
                     ┌──────────────────────────────────────────────┐
   bidder            │  commons.dk-dave.testnet  (Rust / near-sdk)  │
   (own keypair)     │                                              │
      │              │  pool, round clock, keepers, grants, voices │
      │  bid(deposit,│                                              │
      │  grant_key,  │  bid()      → refund the outbid bidder       │
      │  voice_key)  │  settle()   → ANYONE: revoke + install keys  │
      ├─────────────▶│  grant()    → gated on signer_account_pk     │
      │              │  say()      → gated on signer_account_pk     │
      │              │  donate()   → pool only grows                │
      │              └───────┬──────────────────────┬───────────────┘
      │                      │ add_access_key(self) │ delete_key(self)
      │              ┌───────▼──────────────────────▼───────────────┐
      │              │  two scoped keys, 0.25 NEAR allowance each   │
      │              └───────┬──────────────────────┬───────────────┘
      │                      │ grant key            │ voice key
      │              ┌───────▼──────┐        ┌──────▼───────┐
      └─── public ──▶│  a stranger  │        │ near.social  │
           record    │  gets funded │        │ / `say` feed │
                     └──────────────┘        └──────────────┘
```

No backend, no cron, no keeper service. The chain is the server; the web page reads the
contract directly over public RPC.

- `contract/` — Rust, `near-sdk` 5, one file, no setters. 10 unit tests.
- `scripts/` — the auditable CLI: deploy, bid, settle, say, grant, donate, refuse, state, demo.
- `web/` — Next.js 16 page. Reads the contract every second; holds no keys.

## Running it

Prerequisites: Node 22+, Rust with the `wasm32-unknown-unknown` target, and a testnet account's
credentials in `~/.near-credentials/testnet/<account>.json`.

```bash
# contract
cd contract && cargo build --target wasm32-unknown-unknown --release
cargo test --target x86_64-unknown-linux-gnu     # 10 tests

# CLI (from the repo root)
pnpm install
node scripts/keys.mjs commons.dk-dave.testnet    # once: mint a keypair for the treasury
node scripts/deploy.mjs                          # create sub-account, deploy, init
node scripts/donate.mjs dk-dave.testnet 4        # seed the pool
node scripts/bid.mjs dk-alice.testnet 0.3        # mints the bidder's two keys
node scripts/settle.mjs                          # anyone, after the round ends
node scripts/say.mjs .keeper-voice-… "hello"     # the keeper speaks
node scripts/grant.mjs .keeper-grant-… dk-erin.testnet "take this"
node scripts/refuse.mjs .keeper-grant-… .keeper-voice-…
node scripts/state.mjs                           # the full ledger + installed keys

# web
cd web && pnpm install && pnpm build && pnpm start
```

Environment: `DAYKEEPER_CONTRACT`, `NEAR_NETWORK`, `NEAR_RPC` (scripts) and
`NEXT_PUBLIC_DAYKEEPER_CONTRACT`, `NEXT_PUBLIC_NEAR_NETWORK`, `NEXT_PUBLIC_NEAR_RPC` (web).
Launch parameters are set at deploy: `ROUND_SECS`, `PRICE_FLOOR`, `STEP_BPS`, `CAP_BPS`.

## What a judge should try first

1. Open the page. Everything on it comes from the contract.
2. In a terminal: `node scripts/state.mjs` — the same numbers, plus the two installed keys.
3. `node scripts/settle.mjs` when the clock runs out, and watch the keys appear on the treasury
   account in `node scripts/state.mjs`.
4. Run `node scripts/refuse.mjs` and watch the chain refuse five different abuses.

## Verification: what is real, what is not

**Real and verified on testnet** (hashes in `docs/demo-run.md`):

- the auction, outbid bids refunded in the same transaction
- the handover: the contract mints two scoped keys on its own account
- the keeper speaking with no NEAR and no wallet (`say`)
- the keeper funding a stranger who never touched the product (`grant`)
- five refusals, each rejected by the chain
- end of day: both keys deleted from the account

**Real but constrained**

- parameters are fixed at launch: changing the round length or the cap means deploying a new
  contract. That is deliberate — a treasury with an admin key is a treasury with an admin.
- the voice writes to contract state. On mainnet the same key shape can be pointed at the
  `social` account to write to near.social (`__fastdata_kv`); the scope string changes, the
  contract does not. Not deployed on mainnet yet.

**Not built**

- bidding from the web page (the page is read-only by design; `scripts/bid.mjs` is the path)
- Sybil resistance in the auction: bids are permissionless, as they are for any auction
- multiple concurrent keeperships — one treasury holds one seat

## Security notes

- **The keeper cannot take the pool.** A function-call key cannot attach NEAR, and the only
  method that moves money computes the amount from launch parameters.
- **The keeper cannot outlive the round.** Expiry is a `block_timestamp` check in every
  privileged method, not a revocation job that might not run.
- **The keeper can still misdirect the grant.** The cap bounds the damage; the record makes it
  public. This is the honest trade: one keeper decides, and everyone can see what they chose.
- **Refusals surface as a WASM trap.** Rejected contract calls return
  `WebAssembly trap: An 'unreachable' opcode` without the `require!` message, because wasm
  builds abort on panic. The CLI pre-checks the common cases (`bid.mjs` tells you to settle
  first rather than trapping) and the unit tests assert the exact messages natively.

## Roadmap

- mainnet deployment with the voice key pointed at `social` (near.social) instead of local state
- a keeper agent: an AI can bid, receive the same scoped keys, and be bounded by the same cap
- proposals: keepers choose between public requests instead of naming a recipient from memory
- an on-page bid flow with wallet-selector, keeping the key-minting path client-side
