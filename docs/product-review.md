# Daykeeper — product review, 8 Nov 2026

Written after re-reading the merge rubric and reading three direct competitors' demos.
No submission content here. Product only.

## Verdict in one line

The mechanic is genuinely novel and NEAR-native, and the engineering is real — but as shipped
today Daykeeper is **not yet a product**: the keeper pays more than they can give away, nobody
can touch the app, and there is no beneficiary. Fix those three and it is a contender in
`social`. Leave them and a judge bounces in 30 seconds.

## What is actually strong (keep, don't dilute)

1. **A capability the protocol enforces, not the code.** A function-call key cannot attach NEAR
   and cannot call a method outside its scope. Competitors implement authority as contract logic
   — their "tier" is an `if`. Ours is a key that the chain refuses. That is a real, checkable
   difference and 5/5 recorded refusals prove it.
2. **Expiry as a fact, not a policy.** Every method re-checks `block_timestamp`. No cron, no
   admin, no sweeper bot to trust. Nothing else in the field has a power that dies on a clock.
3. **Permissionless settle.** Anyone rings the bell; the transition does not depend on us being
   online. No backend to switch off.
4. **The evidence is unusually good.** Live contract, 10 native tests, a transcript where every
   claim carries a transaction hash, and a control run whose five refusals are the chain's own
   error strings. Judges and the AI screener can check all of it without trusting me.
5. **Distribution of the whole mechanic into one page** that reads the chain directly.

## What is weak (ranked by how likely it is to lose the prize)

### 1. FATAL — the keeper buys a guaranteed loss
Pool 3.04 NEAR, cap 5% = 0.152 NEAR. Alice bid **1.2 NEAR** for the right to give away
**0.16 NEAR**. A rational bidder never appears. A judge asks "why would anyone bid?" and today
the honest answer is "nobody should". Everything else in the pitch is downstream of this.
**Fix:** the grant cap must be an absolute amount fixed at launch (`give`), not a percentage of
the pool, so `cap = min(give, pool)`. Bid 0.22 → hand out 1.0. Now the auction prices *control*
instead of pricing a worse-than-random donation, and it has a natural ceiling (the cap), which
is what makes an auction an auction.

### 2. FATAL — nobody can try it
The page is read-only. Q-012 says a hosted demo is a plus but judges must be able to open it;
opening ours shows a clock. Two of the three competitors have a runnable script with an exit
code, and Potluck's demo prints a 16-row table of ok/rejected. A judge who cannot *do* the
thing will score the mechanic as a claim.
**Fix:** an in-browser keeper console that signs client-side (no wallet, no server custody):
mint the two keys in the page → get the exact bid command or use a funded burner → when your
key is installed on the treasury the console unlocks speak/grant → and a "try to take the pool"
button that shows the chain refusing, live, in the reviewer's own browser.

### 3. SERIOUS — there is no beneficiary, so the story has no object
"Fund anyone" is not a product decision, it's an absence of one. The keeper currently invents a
recipient. Compare Patch Fund (pays OSS security fixes) and Petty Cash (DAO budgets): both have
an obvious thing the money is for.
**Fix:** an on-chain **request queue**. Anyone posts an ask (text + amount) with a small fee that
goes into the pool. The keeper funds one per day, and the grant records which ask it answered.
Now the page has content, donors have a reason to give, the keeper has a job, and the voice
power has something to say: *why this ask*.

### 4. SERIOUS — the seat is a one-day dictator with a friend
Nothing stops a keeper naming their own second account. The cap bounds it and the record exposes
it, but "bounded theft" is a weak answer.
**Fix:** `recipient != keeper` as a contract invariant ("you cannot name yourself"), keep the cap,
make the grant name the ask it answered. Then state the residual honestly: a keeper can still
favour an accomplice, once, up to the cap, in public.

### 5. REAL — the voice has no audience
Our voice writes to contract state; near.social exists only on mainnet. So the "megaphone" half
of the product is a promise.
**Fix now:** stop implying otherwise (done in copy). **Fix the perception:** make the most
interesting keeper an **agent** — an autonomous keeper that reads the ask queue, picks one, and
explains itself in the same transaction that pays. That makes the voice load-bearing instead of
decorative, and it is ~100 lines of script, no contract change.

### 6. REAL — the field has three strong neighbours and they use the track's named primitives
Read the `social` track hint again: *"Build shared budgets, programmable rewards, collective
ownership... on top of Sputnik DAO and Trezu. Don't rebuild the multisig — build what communities
do with it."* The field answers that literally:

- **Petty Cash** — Sputnik DAO budgets with rules: inside a budget a payment leaves in seconds,
  outside it needs a council vote.
- **Patch Fund** — Sputnik DAO treasury paying OSS security fixes, tiered by earned trust.
- **Potluck** — a shared NEAR pot, allowances = reputation × unit, endorsements pay rewards,
  with a 16-step recorded run (autonomous-agent entrant).

All three: **authority is graded by rules**. We are the only one where **authority is sold, time
boxed, and handed over as a revocable key**. That is our sentence and it must be the first
paragraph, not a footnote:
> They decide *how much* someone may spend. We decide *who holds it, what it costs, and when it
> ends* — and the ending is a key the chain deletes.
Not touching Sputnik is a defensible choice **if stated**: our treasury is not a multisig with
policies, it is a market for one day of spending authority. (Sputnik/Trezu integration is the
obvious next step; pretending we have it is not.)

### 7. Minor but cheap
- Round length reads "2 minutes" with no explanation; say "90 seconds here so you can watch it —
  a day on mainnet".
- Donations have no receipt and no status. A donor wall costs one map and gives giving a reason.
- No share card, so the X post renders a bare link.
- `demo.mjs` writes a transcript but does not *assert*; make it exit non-zero when reality
  deviates, and add `verify.mjs` re-checking historical on-chain facts. The AI screener reads
  exit codes better than prose.

## Plan, in dependency order

| # | Change | Why it moves the needle | Where |
|---|---|---|---|
| P0 | absolute `give` cap, `request()` queue with fee, `grant(request, recipient, memo)`, `recipient != keeper`, donor wall | kills the fatal economics flaw, gives the product an object | contract v3 + tests + CLI + redeploy + re-record |
| P1 | in-browser keeper console: client-minted keys, client-side signing, funded burner endpoint, "try to take" refusal | turns a read-only page into a thing a judge does | web |
| P2 | `keeper-agent.mjs` — an autonomous keeper that reads asks, picks one, says why, pays | makes the voice power load-bearing; ties social + agents without faking an agent market | scripts |
| P3 | `verify.mjs` with an exit code; demo asserts every step | Q-017: machine-checkable reproducibility | scripts |
| P4 | README/page narrative: leverage math, the two-line delta vs Petty Cash / Patch Fund / Potluck, honest limits; OG card; screenshots | a judge reads the first paragraph and the page, in that order | repo + web |

Order matters: P0 changes state shape, so web work (P1) comes after the redeploy, or it will be
rewired twice.

## Goal

Ship P0–P4, then re-record a demo in which a **funded browser user takes the seat, funds a public
ask, tries to take the pool and is refused, and the day ends with the key deleted** — so the
first thing a judge sees is the mechanic happening to them, not a description of it.

Success test: a stranger with no CLI and no NEAR can, in under two minutes on
`daykeeper-tau.vercel.app`: post an ask, take the seat, speak, fund the ask, and hit a refusal
that the chain itself printed.
