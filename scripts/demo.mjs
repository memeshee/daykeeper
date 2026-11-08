// The whole story, once, with real testnet transactions, recorded to docs/demo-run.md.
// Deploy with short rounds first, e.g.  ROUND_SECS=60 node scripts/deploy.mjs
//   node scripts/demo.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { actionCreators } from "@near-js/transactions";
import { KeyPair } from "@near-js/crypto";
import { CONTRACT, account, call, credentials, fmtNear, parseNear, view } from "./lib.mjs";

const alice = "dk-alice.testnet";
const bruno = "dk-bruno.testnet";
const chen = "dk-chen.testnet";
const outsider = "dk-erin.testnet"; // never touches the app: a plain testnet address
const bell = "dk-dave.testnet"; // rings the bell; holds no special rights

import { appendFileSync, mkdirSync as mkdir } from "node:fs";
mkdir("docs", { recursive: true });
const lines = [];
// write through, so a long run leaves a usable transcript even if it is interrupted
const log = (s = "") => {
  console.log(s);
  lines.push(s);
  appendFileSync("docs/demo-run.md", `${s}\n`);
};
const tx = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;

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

writeFileSync("docs/demo-run.md", "");
log(`# Daykeeper — demo run`);
log();
log(`Contract: \`${CONTRACT}\` (testnet) · ${new Date().toISOString()}`);
log();

// --- 1. the pool exists ---------------------------------------------------
log(`## 1. A treasury that only grows`);
{
  const c = credentials(bell);
  const res = await call({ signerId: bell, secretKey: c.secret, method: "donate", args: {}, deposit: parseNear("2"), gas: 20n * 10n ** 12n });
  const s = await view(CONTRACT, "get_state");
  log(`Someone donated 2 NEAR → ${tx(res.hash)}`);
  log(`Pool: **${fmtNear(s.pool_yocto)} NEAR**. Grant cap this round: ${fmtNear(s.grant_cap_yocto)} NEAR.`);
  log();
}

// --- 2. the auction ------------------------------------------------------
log(`## 2. The auction for the next day`);
{
  // bid into a fresh window: clear whatever round is running first
  const s0 = await view(CONTRACT, "get_state");
  if (!s0.awaiting_settle) {
    log(`(waiting out round ${s0.round} so the auction starts clean)`);
    await sleepUntilRoundEnd();
  }
  await settle();
  log(`Round open. Three bidders, each minting two keys locally.`);
}
await bid(alice, "0.5");
await bid(bruno, "0.7");
log(`  → bruno's bid refunded alice automatically, in the same transaction`);
await bid(alice, "1.2");
log(`  → alice's second bid refunded bruno`);
log();
const before = await view(CONTRACT, "get_state");
log(`Leading: **${before.high_bidder}** at ${fmtNear(before.high_bid_yocto)} NEAR · minimum next bid ${fmtNear(before.next_min_bid_yocto)} NEAR`);
log();
log(`Waiting for the round to end (this is the clock doing the work, not a server)…`);
const ended = await sleepUntilRoundEnd();
log(`Round ${ended.round} is over. Anyone may ring the bell.`);
log();

// --- 3. the handover -----------------------------------------------------
log(`## 3. The handover`);
{
  const res = await settle();
  log(`dk-dave (a stranger with no stake) rings the bell → ${tx(res.hash)}`);
  const s = await view(CONTRACT, "get_state");
  log(`Keeper: **${s.keeper}**`);
  log(`Grant key installed on the treasury: \`${s.grant_key}\` (methods: grant)`);
  log(`Voice key installed on the treasury: \`${s.voice_key}\` (methods: say)`);
  log(`Neither key can attach NEAR, so neither can move the pool.`);
  log();
}

// --- 4. the two powers ---------------------------------------------------
log(`## 4. The two powers, used with no wallet and no NEAR`);
{
  const voice = readFileSync(`.keeper-voice-${alice}`, "utf8").trim();
  const said = await call({
    signerId: CONTRACT,
    secretKey: voice,
    method: "say",
    args: { text: "I bought today. I have never held NEAR. I cannot take a single yocto of this." },
    gas: 10n * 10n ** 12n,
  });
  log(`The keeper speaks as the treasury → ${tx(said.hash)}`);

  const grantKey = readFileSync(`.keeper-grant-${alice}`, "utf8").trim();
  const s0 = await view(CONTRACT, "get_state");
  const gifted = await call({
    signerId: CONTRACT,
    secretKey: grantKey,
    method: "grant",
    args: { recipient: outsider, memo: "you asked for nothing, here is something" },
    gas: 60n * 10n ** 12n,
  });
  log(
    `The keeper grants ${fmtNear(s0.grant_cap_yocto)} NEAR to ${outsider} (never used Daykeeper) → ${tx(gifted.hash)}`,
  );
  const s1 = await view(CONTRACT, "get_state");
  log(`Grants left this round: ${s1.keeper_grants_left}. Pool is now ${fmtNear(s1.pool_yocto)} NEAR.`);
  log();
}

// --- 5. the control run --------------------------------------------------
log(`## 5. The control run — five things a keeper must not be able to do`);
{
  const grantKey = readFileSync(`.keeper-grant-${alice}`, "utf8").trim();
  const voiceKey = readFileSync(`.keeper-voice-${alice}`, "utf8").trim();
  const attempts = [
    ["voice key calls grant", "the voice key is scoped to `say`", () => call({ signerId: CONTRACT, secretKey: voiceKey, method: "grant", args: { recipient: outsider, memo: "no" }, gas: 60n * 10n ** 12n })],
    ["grant key calls say", "the grant key is scoped to `grant`", () => call({ signerId: CONTRACT, secretKey: grantKey, method: "say", args: { text: "no" }, gas: 30n * 10n ** 12n })],
    [
      "voice key sends NEAR out",
      "function-call keys cannot attach NEAR",
      async () => {
        const acct = await account(CONTRACT, voiceKey);
        const out = await acct.signAndSendTransaction({ receiverId: outsider, actions: [actionCreators.transfer(1n)] });
        return { hash: out.transaction_outcome?.id };
      },
    ],
    ["grant key calls donate", "only the scoped method name is allowed", () => call({ signerId: CONTRACT, secretKey: grantKey, method: "donate", args: {}, deposit: 1n, gas: 10n * 10n ** 12n })],
    [
      "outsider calls grant",
      "the predecessor is not the keeper",
      () => {
        const c = credentials(chen);
        return call({ signerId: chen, secretKey: c.secret, method: "grant", args: { recipient: outsider, memo: "no" }, gas: 60n * 10n ** 12n });
      },
    ],
  ];
  let refused = 0;
  for (const [name, why, fn] of attempts) {
    try {
      const r = await fn();
      log(`- **NOT REFUSED** — ${name} (tx ${r?.hash ?? "?"})`);
    } catch (e) {
      refused += 1;
      const msg = String(e.message ?? e).replace(/\s+/g, " ").slice(0, 160);
      log(`- refused: **${name}** — ${why}`);
      log(`  \`${msg}\``);
    }
  }
  log();
  log(`**${refused}/${attempts.length} refused by the chain.**`);
  log();
}

// --- 6. the day ends -----------------------------------------------------
log(`## 6. The day ends`);
await sleepUntilRoundEnd();
{
  const res = await settle();
  log(`The bell again → ${tx(res.hash)}`);
  const s = await view(CONTRACT, "get_state");
  log(`Alice's keys are deleted from the treasury. Keeper now: ${s.keeper ?? "vacant"} · keys: ${s.grant_key ?? "none"} / ${s.voice_key ?? "none"}`);
  log(`Pool: ${fmtNear(s.pool_yocto)} NEAR · keepers so far: ${s.keepers} · grants: ${s.grants} · words: ${s.voices}`);
}

mkdirSync("docs", { recursive: true });
writeFileSync("docs/demo-run.md", `${lines.join("\n")}\n`);
console.log("\nwritten to docs/demo-run.md");
