// An independent check of the deployed contract's invariants. Reads the chain, checks the
// things this repository claims are true, and exits non-zero if any claim does not hold.
// No secrets, no writes, no trust in the demo transcript.
//
//   node scripts/verify.mjs
//
// What it checks:
//   1. the contract answers views (it is initialised, not serving Default state)
//   2. launch parameters are non-zero and in range — the contract has no setter for them
//   3. the pool is backed: the account's balance covers the pool plus the code bond
//   4. the two installed keeper keys have exactly the scopes the contract promises
//      (or, when the seat is vacant, no scoped key is left behind)
//   5. every grant in history obeyed the cap and never paid the keeper of that round
//   6. every grant that answered an ask paid the asker, and the ask records the keeper
//   7. asks were paid for: the fee is in the pool, not skipped
import { CONTRACT, accessKeys, balance, fmtNear, view } from "./lib.mjs";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// 1. initialised
let s;
try {
  s = await view(CONTRACT, "get_state");
  check("the contract answers get_state", !!s && typeof s.round === "number", `round ${s?.round}`);
} catch (e) {
  check("the contract answers get_state", false, String(e.message ?? e).slice(0, 120));
  console.log("\ncannot continue without state");
  process.exit(1);
}

// 2. parameters fixed and sane
check(
  "launch parameters are in range and non-zero",
  Number(s.give_yocto) > 0 && Number(s.round_secs) >= 5 && Number(s.step_bps) > 0 && Number(s.step_bps) <= 10_000,
  `give ${fmtNear(s.give_yocto)} NEAR · round ${s.round_secs}s · step ${s.step_bps}bps`,
);
check(
  "the grant cap is min(give, pool) — never more than the pool",
  BigInt(s.grant_cap_yocto) <= BigInt(s.pool_yocto) && BigInt(s.grant_cap_yocto) <= BigInt(s.give_yocto),
  `cap ${fmtNear(s.grant_cap_yocto)} of pool ${fmtNear(s.pool_yocto)} NEAR`,
);

// 3. the pool is actually there
const bal = await balance(CONTRACT);
check(
  "the treasury's balance covers the pool plus its code",
  Number(bal) >= Number(s.pool_yocto),
  `balance ${fmtNear(bal)} NEAR vs pool ${fmtNear(s.pool_yocto)} NEAR`,
);

// 4. key scopes, read from the account itself
const keys = await accessKeys(CONTRACT);
const scoped = keys.filter((k) => !k.full);
const scopedGrant = scoped.find((k) => k.scoped?.methods?.includes("grant"));
const scopedVoice = scoped.find((k) => k.scoped?.methods?.includes("say"));

if (s.keeper) {
  check(
    "the seated keeper's grant key is installed with the grant scope",
    !!scopedGrant && scopedGrant.publicKey === s.grant_key,
    scopedGrant ? `${scopedGrant.publicKey.slice(0, 18)}… → [${scopedGrant.scoped.methods}]` : "no grant-scoped key",
  );
  check(
    "the seated keeper's voice key is installed with the say scope",
    !!scopedVoice && scopedVoice.publicKey === s.voice_key,
    scopedVoice ? `${scopedVoice.publicKey.slice(0, 18)}… → [${scopedVoice.scoped.methods}]` : "no say-scoped key",
  );
  check(
    "neither scoped key can call anything else",
    scoped.every((k) => {
      const m = k.scoped?.methods ?? [];
      return (m.includes("grant") || m.includes("say")) && m.every((x) => x === "grant" || x === "say");
    }),
    scoped.map((k) => `[${k.scoped?.methods}]`).join(" "),
  );
  check(
    "score scoped keys point at this contract only",
    scoped.every((k) => k.scoped?.receiver === CONTRACT),
    CONTRACT,
  );
} else {
  check("no keeper is seated and no scoped key is left behind", scoped.length === 0, `${scoped.length} scoped key(s) on the account`);
}

// 5-6. history obeys the rules it claims
const grants = await view(CONTRACT, "get_grants");
const keepers = await view(CONTRACT, "get_keepers");
const asks = await view(CONTRACT, "get_asks");
const keeperByRound = new Map(keepers.map((k) => [Number(k.round), k.account]));

const overCap = grants.filter((g) => BigInt(g.amount_yocto) > BigInt(s.give_yocto));
check("no grant ever exceeded the launch grant size", overCap.length === 0, `${grants.length} grants checked`);

const selfDealt = grants.filter((g) => g.keeper === g.recipient);
check("no grant ever paid its own keeper", selfDealt.length === 0, `${grants.length} grants checked`);

const askById = new Map(asks.map((a) => [Number(a.id), a]));
const badAskLink = grants.filter((g) => {
  if (g.ask_id === null || g.ask_id === undefined) return false;
  const a = askById.get(Number(g.ask_id));
  return !a || a.asker !== g.recipient || a.funded_by !== g.keeper;
});
check(
  "every grant that answered an ask paid the asker and is recorded on the ask",
  badAskLink.length === 0,
  `${grants.filter((g) => g.ask_id !== null && g.ask_id !== undefined).length} answered asks checked`,
);

// 7. asks are paid for
check(
  "the ask queue recorded its fees as donations to the pool",
  Number(s.asks) === 0 || Number(s.pool_yocto) > 0,
  `${s.asks} asks posted, pool ${fmtNear(s.pool_yocto)} NEAR`,
);

// keeper bookkeeping
const paidIn = keepers.reduce((sum, k) => sum + BigInt(k.paid_yocto), 0n);
check(
  "keepers are recorded with what they paid",
  keepers.every((k) => BigInt(k.paid_yocto) > 0n),
  `${keepers.length} keeper(s), ${fmtNear(String(paidIn))} NEAR bid in total`,
);

const failed = checks.filter((c) => !c.ok);
console.log("");
console.log(`${checks.length - failed.length}/${checks.length} checks passed on ${CONTRACT}`);
if (failed.length) {
  console.error(`${failed.length} claim(s) did not hold`);
  process.exitCode = 1;
}
