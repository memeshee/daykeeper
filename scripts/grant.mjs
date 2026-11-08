// Spend this round's grant — signed with the GRANT key the contract installed, as the
// treasury account. No wallet, no NEAR of your own.
//   node scripts/grant.mjs .keeper-grant-dk-alice.testnet dk-erin.testnet "for the bus fare"
import { readFileSync } from "node:fs";
import { CONTRACT, call, fmtNear, view, printState } from "./lib.mjs";

const [keyFile, recipient = "dk-erin.testnet", ...memoWords] = process.argv.slice(2);
if (!keyFile) {
  console.error("usage: node scripts/grant.mjs <grant-key-file> <recipient> <memo>");
  process.exit(1);
}
const memo = memoWords.join(" ");

const keeperKey = readFileSync(keyFile, "utf8").trim();
const s = await view(CONTRACT, "get_state");
console.log(`keeper ${s.keeper} · grants left ${s.keeper_grants_left} · cap ${fmtNear(s.grant_cap_yocto)} NEAR`);

const res = await call({
  signerId: CONTRACT,
  secretKey: keeperKey,
  method: "grant",
  args: { recipient, memo },
  gas: 60n * 10n ** 12n,
});
console.log(`grant → ${res.hash}`);
if (res.logs.length) console.log(res.logs.map((l) => `  · ${l}`).join("\n"));
printState(await view(CONTRACT, "get_state"));
