// Spend this round's grant — signed with the GRANT key the contract installed, as the
// treasury account. No wallet, no NEAR of your own.
//   node scripts/grant.mjs .keeper-grant-dk-alice.testnet dk-erin.testnet "for the bus fare"
//   node scripts/grant.mjs .keeper-grant-dk-alice.testnet --ask 1 "answering the ask"
import { readFileSync } from "node:fs";
import { CONTRACT, call, fmtNear, view, printState } from "./lib.mjs";

let args = process.argv.slice(2);
const keyFile = args.shift();
if (!keyFile) {
  console.error("usage: node scripts/grant.mjs <grant-key-file> <recipient|--ask <id>> <memo>");
  process.exit(1);
}
let askId = null;
let recipient;
if (args[0] === "--ask") {
  args.shift();
  askId = Number(args.shift());
  const asks = await view(CONTRACT, "get_asks");
  const ask = asks.find((a) => Number(a.id) === askId);
  if (!ask) {
    console.error(`no ask ${askId}; open asks: ${asks.filter((a) => !a.funded_by).map((a) => a.id).join(", ") || "none"}`);
    process.exit(1);
  }
  recipient = ask.asker; // the contract requires this, and it proves the grant answered the ask
  console.log(`ask ${askId} by ${ask.asker}: "${ask.text}"`);
} else {
  recipient = args.shift();
}
const memo = args.join(" ");

const keeperKey = readFileSync(keyFile, "utf8").trim();
const s = await view(CONTRACT, "get_state");
console.log(`keeper ${s.keeper} · grants left ${s.keeper_grants_left} · cap ${fmtNear(s.grant_cap_yocto)} NEAR`);

const res = await call({
  signerId: CONTRACT,
  secretKey: keeperKey,
  method: "grant",
  args: { ask_id: askId, recipient, memo },
  gas: 60n * 10n ** 12n,
});
console.log(`grant → ${res.hash}`);
if (res.logs.length) console.log(res.logs.map((l) => `  · ${l}`).join("\n"));
printState(await view(CONTRACT, "get_state"));
