// Ring the bell. Permissionless: any account can settle a finished round.
//   node scripts/settle.mjs [who]
import { CONTRACT, credentials, call, printState, view, accessKeys } from "./lib.mjs";

const who = process.argv[2] || "dk-dave.testnet";
const accountId = who.includes(".") ? who : `dk-${who}.testnet`;
const c = credentials(accountId);

const res = await call({ signerId: accountId, secretKey: c.secret, method: "settle", args: {} });
console.log(`settle by ${accountId} → ${res.hash}`);
if (res.logs.length) console.log(res.logs.map((l) => `  · ${l}`).join("\n"));

const s = await view(CONTRACT, "get_state");
printState(s);
console.log("\naccess keys on the treasury:");
for (const k of await accessKeys(CONTRACT)) {
  const scope = k.full
    ? "FULL ACCESS"
    : `methods=[${k.scoped?.methods?.join(",")}] allowance=${k.scoped?.allowance}`;
  console.log(`  ${k.publicKey} → ${scope}`);
}
