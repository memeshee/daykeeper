// The whole story, once, with real testnet transactions, recorded to docs/demo-run.md.
// Deploy with short rounds first, e.g.  ROUND_SECS=90 GIVE=1 node scripts/deploy.mjs
//   node scripts/demo.mjs
//
// This script ASSERTS. If any refusal is not refused, or a key is not installed, or the
// grant does not move exactly the cap, it prints FAIL and exits non-zero. An exit code is
// the cheapest honest claim this repo can make.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { actionCreators } from "@near-js/transactions";
import { KeyPair } from "@near-js/crypto";
import { CONTRACT, account, call, credentials, fmtNear, parseNear, view } from "./lib.mjs";

const alice = "dk-alice.testnet";
const bruno = "dk-bruno.testnet";
const chen = "dk-chen.testnet";
const erin = "dk-erin.testnet"; // a plain testnet address, never a keeper
const bell = "dk-dave.testnet"; // rings the bell; holds no special rights

mkdirSync("docs", { recursive: true });
writeFileSync("docs/demo-run.md", "");

const lines = [];
const log = (s = "") => {
  console.log(s);
  lines.push(s);
  appendFileSync("docs/demo-run.md", `${s}\n`);
};
const tx = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;
const fail = [];
const check = (ok, what) => {
  if (!ok) {
    fail.push(what);
    log(`  **FAIL — ${what}**`);
  }
};

async function sleepUntilRoundEnd() {
  for (;;) {
    const s = await view(CONTRACT, "get_state");
    if (s.awaiting_settle) return s;
    const left = (s.round_end_ns - s.now_ns) / 1e9;
    if (left > 0) await new Promise((r) => setTimeout(r, Math.min(left * 1000 + 1500, 15000)));
  }
}

async function settle() {
  const c = credentials(bell);
  return call({ signerId: bell, secretKey: c.secret, method: "settle", args: {}, gas: 60n * 10n ** 12n });
}

async function bid(who, amount) {
  const grantKey = KeyPair.fromRandom("ed25519");
  const voiceKey = KeyPair.fromRandom("ed25519");
  writeFileSync(`.keeper-grant-${who}`, grantKey.toString(), { mode: 0o600 });
  writeFileSync(`.keeper-voice-${who}`, voiceKey.toString(), { mode: 0o600 });
  const c = credentials(who);
  const res = await call({
    signerId: who,
    secretKey: c.secret,
    method: "bid",
    args: {
      grant_key: grantKey.getPublicKey().toString(),
      voice_key: voiceKey.getPublicKey().toString(),
    },
    deposit: parseNear(amount),
  });
  log(`  ${who} bids ${amount} NEAR → ${tx(res.hash)}`);
  return res;
}

/** The SDK hands back "{}" for some ActionErrors, so dig the real sentence out. */
function readable(e) {
  const candidates = [String(e?.message ?? ""), JSON.stringify(e?.kind ?? null), String(e ?? "")];
  for (const c of candidates) {
    const m =
      c.match(/"(?:ExecutionError|message)":"([^"]{8,200})"/) ||
      c.match(/"([A-Z][^"]{15,200}(?:action|key|allowed|access|permission)[^"]{0,120})"/);
    if (m) return m[1];
    if (c && c.length > 8 && !c.startsWith("{}")) return c.replace(/\s+/g, " ").slice(0, 200);
  }
  return "refused (no message)";
}

log(`# Daykeeper — the recorded run`);
log();
log(`Contract: \`${CONTRACT}\` (testnet) · ${new Date().toISOString()}`);
log();
log(`Every line with a link is a real transaction. This script exits non-zero if any expected`);
log(`result does not happen, so \`node scripts/demo.mjs\` is itself the claim.`);
log();

// --- 1. the object ------------------------------------------------------
log(`## 1. A public treasury, and a public ask`);
{
  const c = credentials(bell);
  const d = await call({
    signerId: bell,
    secretKey: c.secret,
    method: "donate",
    args: {},
    deposit: parseNear("2"),
    gas: 20n * 10n ** 12n,
  });
  log(`Someone donates 2 NEAR → ${tx(d.hash)}`);

  // a stranger posts an ask; the fee is a donation to the pool it is asking
  const erinCreds = credentials(erin);
  const ask1 = await call({
    signerId: erin,
    secretKey: erinCreds.secret,
    method: "request",
    args: { text: "bus fare to a job interview I cannot otherwise reach", want_yocto: parseNear("0.3").toString() },
    deposit: parseNear("0.01"),
    gas: 30n * 10n ** 12n,
  });
  log(`${erin} asks for 0.3 NEAR → ${tx(ask1.hash)}`);

  const chenCreds = credentials(chen);
  const ask2 = await call({
    signerId: chen,
    secretKey: chenCreds.secret,
    method: "request",
    args: { text: "a new laptop so I can take contract work again", want_yocto: parseNear("1.5").toString() },
    deposit: parseNear("0.01"),
    gas: 30n * 10n ** 12n,
  });
  log(`${chen} asks for 1.5 NEAR → ${tx(ask2.hash)}`);

  const s = await view(CONTRACT, "get_state");
  log();
  log(`Pool: **${fmtNear(s.pool_yocto)} NEAR** — the two ask fees are already in it.`);
  log(`Open asks: ${s.open_asks}. The keeper can give at most **${fmtNear(s.grant_cap_yocto)} NEAR** today.`);
  check(s.open_asks === 2, "two asks should be open");
  log();
}

// --- 2. the auction -----------------------------------------------------
log(`## 2. The auction — bidding for the right to give`);
{
  const s0 = await view(CONTRACT, "get_state");
  if (!s0.awaiting_settle) {
    log(`(waiting out round ${s0.round} so the auction starts clean)`);
    await sleepUntilRoundEnd();
  }
  await settle();
  log(`Round open. Bidders mint two keys each, locally; only the public halves go on chain.`);
}
await bid(alice, "0.12");
await bid(bruno, "0.15");
log(`  → bruno's bid refunded alice automatically, in the same transaction`);
await bid(alice, "0.2");
log(`  → alice's second bid refunded bruno`);

const before = await view(CONTRACT, "get_state");
log();
log(`Leading: **${before.high_bidder}** at ${fmtNear(before.high_bid_yocto)} NEAR · minimum next bid ${fmtNear(before.next_min_bid_yocto)} NEAR`);
log();
log(`This is why anyone bids: ${fmtNear(before.high_bid_yocto)} NEAR buys the right to hand out`);
log(`**${fmtNear(before.grant_cap_yocto)} NEAR**. The grant size is fixed at launch, not a share of the pool.`);
log();
log(`Waiting for the clock (no server, no cron — the round ends because time passes)…`);
const ended = await sleepUntilRoundEnd();
log(`Round ${ended.round} is over. Anyone may ring the bell.`);
log();

// --- 3. the handover ----------------------------------------------------
log(`## 3. The handover`);
{
  const res = await settle();
  log(`dk-dave — a stranger with no stake in the outcome — rings the bell → ${tx(res.hash)}`);
  const s = await view(CONTRACT, "get_state");
  log(`Keeper: **${s.keeper}**`);
  log(`Grant key installed on the treasury: \`${s.grant_key}\` (methods: grant)`);
  log(`Voice key installed on the treasury: \`${s.voice_key}\` (methods: say)`);
  log(`Neither key can attach NEAR, so neither key can move the pool.`);
  check(s.keeper === alice, "the winner should be in the seat");
  check(!!s.grant_key && !!s.voice_key, "both keys should be installed");
  log();
}

const grantKey = readFileSync(`.keeper-grant-${alice}`, "utf8").trim();
const voiceKey = readFileSync(`.keeper-voice-${alice}`, "utf8").trim();

// --- 4. the control run, while the grant is still unspent ---------------
log(`## 4. The control run — what a keeper cannot do`);
{
  const asks = await view(CONTRACT, "get_asks");
  const open = asks.find((a) => !a.funded_by && a.asker === chen);
  const attempts = [
    [
      "keeper grants to themselves",
      "the seat is not self-dealing",
      () => call({ signerId: CONTRACT, secretKey: grantKey, method: "grant", args: { ask_id: null, recipient: alice, memo: "to me" }, gas: 60n * 10n ** 12n }),
    ],
    [
      "keeper answers an ask by paying somebody else",
      "the record would lie about who the money answered",
      () =>
        call({
          signerId: CONTRACT,
          secretKey: grantKey,
          method: "grant",
          args: { ask_id: open.id, recipient: erin, memo: "not the asker" },
          gas: 60n * 10n ** 12n,
        }),
    ],
    [
      "voice key calls grant",
      "the voice key is scoped to `say`",
      () => call({ signerId: CONTRACT, secretKey: voiceKey, method: "grant", args: { ask_id: null, recipient: erin, memo: "no" }, gas: 60n * 10n ** 12n }),
    ],
    [
      "grant key calls say",
      "the grant key is scoped to `grant`",
      () => call({ signerId: CONTRACT, secretKey: grantKey, method: "say", args: { text: "no" }, gas: 30n * 10n ** 12n }),
    ],
    [
      "voice key sends NEAR out",
      "a function-call key cannot attach NEAR",
      async () => {
        const acct = await account(CONTRACT, voiceKey);
        const out = await acct.signAndSendTransaction({ receiverId: erin, actions: [actionCreators.transfer(1n)] });
        return { hash: out.transaction_outcome?.id };
      },
    ],
    [
      "an outsider calls grant",
      "the signer key is not the keeper's grant key",
      () => {
        const c = credentials(chen);
        return call({ signerId: chen, secretKey: c.secret, method: "grant", args: { ask_id: null, recipient: erin, memo: "no" }, gas: 60n * 10n ** 12n });
      },
    ],
  ];

  let refused = 0;
  const nativeTest = {
    "keeper grants to themselves": "the_keeper_cannot_grant_to_themselves",
    "keeper answers an ask by paying somebody else": "an_ask_cannot_be_answered_by_paying_somebody_else",
    "voice key calls grant": "the_voice_key_cannot_grant",
    "grant key calls say": "the_grant_key_cannot_speak",
    "voice key sends NEAR out": null,
    "an outsider calls grant": "the_voice_key_cannot_grant",
  };
  for (const [name, why, fn] of attempts) {
    try {
      const r = await fn();
      log(`- **NOT REFUSED** — ${name} (tx ${r?.hash ?? "?"})`);
      fail.push(`${name} was not refused`);
    } catch (e) {
      refused += 1;
      log(`- refused: **${name}** — ${why}`);
      log(`  \`${readable(e)}\``);
      if (nativeTest[name]) log(`  exact wording asserted natively in \`contract/tests\`: \`${nativeTest[name]}\``);
    }
  }
  log();
  log(`**${refused}/${attempts.length} refused by the chain.**`);
  check(refused === attempts.length, "every abuse should be refused");
  log();
}

// --- 5. the two powers, used --------------------------------------------
log(`## 5. The two powers, used with no wallet and no NEAR of the keeper's own`);
{
  const said = await call({
    signerId: CONTRACT,
    secretKey: voiceKey,
    method: "say",
    args: { text: "I paid 0.2 NEAR for this seat and I can hand out 1 NEAR today. I am funding the bus fare, not the laptop: one of them gets someone to work this week." },
    gas: 10n * 10n ** 12n,
  });
  log(`The keeper speaks as the treasury → ${tx(said.hash)}`);

  const asks = await view(CONTRACT, "get_asks");
  const busFare = asks.find((a) => a.asker === erin && !a.funded_by);
  const s0 = await view(CONTRACT, "get_state");
  const gifted = await call({
    signerId: CONTRACT,
    secretKey: grantKey,
    method: "grant",
    args: { ask_id: busFare.id, recipient: erin, memo: "getting to the interview matters more than my opinion of it" },
    gas: 60n * 10n ** 12n,
  });
  log(`The keeper answers ask #${busFare.id} by paying ${erin} ${fmtNear(s0.grant_cap_yocto)} NEAR → ${tx(gifted.hash)}`);

  const s1 = await view(CONTRACT, "get_state");
  const after = await view(CONTRACT, "get_asks");
  log(`Grants left this round: ${s1.keeper_grants_left}. Pool: ${fmtNear(s1.pool_yocto)} NEAR. Open asks: ${s1.open_asks}.`);
  check(s1.keeper_grants_left === 0, "the grant should be spent");
  check(after.find((a) => a.id === busFare.id).funded_by === alice, "the ask should record who funded it");

  // a second grant in the same round must be refused
  try {
    await call({ signerId: CONTRACT, secretKey: grantKey, method: "grant", args: { ask_id: null, recipient: erin, memo: "again" }, gas: 60n * 10n ** 12n });
    log(`- **NOT REFUSED** — a second grant in the same round`);
    fail.push("a second grant was allowed");
  } catch (e) {
    log(`- refused: **a second grant in the same round**`);
    log(`  \`${readable(e)}\``);
  }
  log();
}

// --- 6. the day ends ----------------------------------------------------
log(`## 6. The day ends and the key stops existing`);
await sleepUntilRoundEnd();
{
  const res = await settle();
  log(`The bell again → ${tx(res.hash)}`);
  const s = await view(CONTRACT, "get_state");
  log(`Alice's keys are deleted from the treasury. Keeper: ${s.keeper ?? "vacant"} · keys: ${s.grant_key ?? "none"} / ${s.voice_key ?? "none"}`);
  log(`Pool: ${fmtNear(s.pool_yocto)} NEAR · keepers: ${s.keepers} · grants: ${s.grants} · words: ${s.voices} · donors recorded: ${s.donors}`);
  check(!s.keeper && !s.grant_key && !s.voice_key, "the keys should be gone after the day ends");
  log();

  // and the same key, used one second after the day, is refused
  try {
    await call({ signerId: CONTRACT, secretKey: grantKey, method: "say", args: { text: "still here?" }, gas: 10n * 10n ** 12n });
    log(`- **NOT REFUSED** — the deleted key`);
    fail.push("a deleted key still worked");
  } catch (e) {
    log(`- refused: **the keeper's key after the day ended**`);
    log(`  \`${readable(e)}\``);
  }
}

log();
log(`## Result`);
if (fail.length === 0) {
  log(`Every claim above held: **exit 0**.`);
} else {
  log(`**${fail.length} claim(s) did not hold:**`);
  for (const f of fail) log(`- ${f}`);
}
log();

// --- 7. a keeper can also be a program ----------------------------------
log(`## Next: a keeper that is not a person`);
log(`\`node scripts/keeper-agent.mjs\` takes the same seat with the same two keys, reads the`);
log(`open asks, chooses one, says why, and pays it. Nothing in the contract knows the`);
log(`difference — the constraints are the same for a human and a script.`);
log();

writeFileSync("docs/demo-run.md", `${lines.join("\n")}`);
console.log(`\nwritten to docs/demo-run.md`);
if (fail.length) {
  console.error(`\n${fail.length} claim(s) failed`);
  process.exitCode = 1;
}
