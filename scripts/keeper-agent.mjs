// A keeper that is not a person.
//
// It bids for the seat with two freshly minted keys, waits for the bell, and — if it won —
// reads the open asks, picks one, says why in the treasury's voice, and pays it. Nothing in
// the contract distinguishes this script from a human holding the same two keys, and it is
// bound by exactly the same limits: one grant, at most `give`, never to itself, dead at the
// deadline.
//
// The choice is a stated rule, not a hidden opinion:
//   1. an ask that fits entirely inside the grant, largest first (it can be fully funded)
//   2. otherwise the oldest open ask
//
//   node scripts/keeper-agent.mjs            # bid the floor, wait, act
//   BID=0.12 node scripts/keeper-agent.mjs   # bid a specific amount
import { writeFileSync } from "node:fs";
import { KeyPair } from "@near-js/crypto";
import { CONTRACT, call, credentials, fmtNear, parseNear, view } from "./lib.mjs";

const ME = process.env.AGENT_ACCOUNT || "dk-chen.testnet";
const bell = process.env.BELL || "dk-dave.testnet";
const BID = process.env.BID || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say_ = (...a) => console.log(...a);

async function state() {
  return view(CONTRACT, "get_state");
}

async function untilRoundEnd() {
  for (;;) {
    const s = await state();
    if (s.awaiting_settle) return s;
    const left = (s.round_end_ns - s.now_ns) / 1e9;
    await sleep(Math.min(left * 1000 + 1200, 15000));
  }
}

async function settle() {
  const c = credentials(bell);
  return call({ signerId: bell, secretKey: c.secret, method: "settle", args: {}, gas: 60n * 10n ** 12n });
}

/** The rule, in the open. */
function choose(asks, cap) {
  const open = asks.filter((a) => !a.funded_by);
  if (open.length === 0) return null;
  const affordable = open
    .filter((a) => BigInt(a.want_yocto) <= BigInt(cap))
    .sort((a, b) => Number(BigInt(b.want_yocto) - BigInt(a.want_yocto)));
  if (affordable.length) return { ask: affordable[0], why: "it fits inside today's grant, so it can be finished" };
  const oldest = open.sort((a, b) => Number(a.id) - Number(b.id))[0];
  return { ask: oldest, why: "it has waited longest and today's grant still helps" };
}

const s0 = await state();
say_(`the treasury is on round ${s0.round}, pool ${fmtNear(s0.pool_yocto)} NEAR, keeper ${s0.keeper ?? "vacant"}`);
say_(`a keeper can hand out ${fmtNear(s0.grant_cap_yocto)} NEAR this round; open asks: ${s0.open_asks}`);

if (s0.awaiting_settle) {
  say_(`ringing the bell on round ${s0.round} first`);
  await settle();
}

// --- 1. bid, minting both keys here -------------------------------------
const grantKey = KeyPair.fromRandom("ed25519");
const voiceKey = KeyPair.fromRandom("ed25519");
writeFileSync(`.keeper-grant-${ME}`, grantKey.toString(), { mode: 0o600 });
writeFileSync(`.keeper-voice-${ME}`, voiceKey.toString(), { mode: 0o600 });

const s1 = await state();
const amount = BID || fmtNear(s1.next_min_bid_yocto);
const me = credentials(ME);
const b = await call({
  signerId: ME,
  secretKey: me.secret,
  method: "bid",
  args: { grant_key: grantKey.getPublicKey().toString(), voice_key: voiceKey.getPublicKey().toString() },
  deposit: parseNear(amount),
});
say_(`bid ${amount} NEAR as ${ME} → ${b.hash}`);
say_(`  the private halves are in .keeper-grant-${ME} and .keeper-voice-${ME}; the chain only ever saw the public ones`);

// --- 2. wait for the bell -----------------------------------------------
say_(`waiting for the round to end (the clock, not a cron job)`);
await untilRoundEnd();
const ring = await settle();
const s2 = await state();
say_(`rang the bell → ${ring.hash}`);
if (s2.keeper !== ME) {
  say_(`outbid: the seat went to ${s2.keeper ?? "nobody"}. Nothing to do — the keys were never installed.`);
  process.exit(0);
}
say_(`the seat is mine: grant key ${s2.grant_key} · voice key ${s2.voice_key}`);

// --- 3. read the queue, decide, explain, pay ----------------------------
const asks = await view(CONTRACT, "get_asks");
say_("");
say_(`open asks:`);
for (const a of asks.filter((x) => !x.funded_by)) {
  say_(`  #${a.id} ${a.asker} wants ${fmtNear(a.want_yocto)} NEAR — "${a.text}"`);
}

const pick = choose(asks, s2.grant_cap_yocto);
if (!pick) {
  say_(`no asks to answer. Saying so, and leaving the money in the pool.`);
  await call({
    signerId: CONTRACT,
    secretKey: voiceKey.toString(),
    method: "say",
    args: { text: "No one has asked for anything today. The pool stays where it is until someone does." },
    gas: 10n * 10n ** 12n,
  });
  process.exit(0);
}

const reason = `I am funding ask #${pick.ask.id}: ${pick.why}. It goes to ${pick.ask.asker}, because the contract will not let me fund anyone else under that ask's name.`;
const said = await call({
  signerId: CONTRACT,
  secretKey: voiceKey.toString(),
  method: "say",
  args: { text: reason },
  gas: 10n * 10n ** 12n,
});
say_(`said why → ${said.hash}`);
say_(`  "${reason}"`);

const paid = await call({
  signerId: CONTRACT,
  secretKey: grantKey.toString(),
  method: "grant",
  args: { ask_id: pick.ask.id, recipient: pick.ask.asker, memo: pick.why },
  gas: 60n * 10n ** 12n,
});
say_(`answered ask #${pick.ask.id}, paying ${pick.ask.asker} → ${paid.hash}`);

const s3 = await state();
say_("");
say_(`round ${s3.round} · pool ${fmtNear(s3.pool_yocto)} NEAR · grants left ${s3.keeper_grants_left} · open asks ${s3.open_asks}`);
say_(`my two keys die at ${new Date(Number(s3.round_end_ns) / 1e6).toISOString()} — whether or not anything runs after me.`);
