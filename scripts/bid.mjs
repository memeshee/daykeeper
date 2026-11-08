// Place a bid for the next keepership, minting the two keys you would receive.
//   node scripts/bid.mjs dk-alice.testnet 0.5
// Writes .keeper-grant-<account> and .keeper-voice-<account> (0600) next to the repo root.
import { writeFileSync } from "node:fs";
import { KeyPair } from "@near-js/crypto";
import { CONTRACT, credentials, call, fmtNear, parseNear, printState, view } from "./lib.mjs";

const [who = "dk-alice.testnet", amount = "0.1"] = process.argv.slice(2);
const accountId = who.includes(".") ? who : `dk-${who}.testnet`;

const grantKey = KeyPair.fromRandom("ed25519");
const voiceKey = KeyPair.fromRandom("ed25519");
writeFileSync(`.keeper-grant-${accountId}`, grantKey.toString(), { mode: 0o600 });
writeFileSync(`.keeper-voice-${accountId}`, voiceKey.toString(), { mode: 0o600 });
console.log(`grant key ${grantKey.getPublicKey()}`);
console.log(`voice key ${voiceKey.getPublicKey()}`);

const s0 = await view(CONTRACT, "get_state");
if (s0.awaiting_settle) {
  console.error(
    `round ${s0.round} is over and nobody has rung the bell yet. Run: node scripts/settle.mjs`,
  );
  process.exit(1);
}
console.log(`round ${s0.round} · min next bid ${fmtNear(s0.next_min_bid_yocto)} NEAR`);

const c = credentials(accountId);
const res = await call({
  signerId: accountId,
  secretKey: c.secret,
  method: "bid",
  args: {
    grant_key: grantKey.getPublicKey().toString(),
    voice_key: voiceKey.getPublicKey().toString(),
  },
  deposit: parseNear(amount),
});
console.log(`bid ${amount} NEAR by ${accountId} → ${res.hash}`);
if (res.logs.length) console.log(res.logs.map((l) => `  · ${l}`).join("\n"));
printState(await view(CONTRACT, "get_state"));
