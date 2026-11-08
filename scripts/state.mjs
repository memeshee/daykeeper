// Print the live treasury state, both keeper keys, and the full ledger.
//   node scripts/state.mjs
import { CONTRACT, fmtNear, view, printState, accessKeys, balance } from "./lib.mjs";

const s = await view(CONTRACT, "get_state");
printState(s);
console.log(`  treasury balance ${fmtNear(await balance(CONTRACT))} NEAR (code + pool)`);

console.log("\nkeepers:");
for (const k of await view(CONTRACT, "get_keepers")) {
  console.log(
    `  round ${k.round} · ${k.account} paid ${fmtNear(k.paid_yocto)} NEAR · grants ${k.grants_made} · words ${k.words_spoken}`,
  );
}
console.log("grants:");
for (const g of await view(CONTRACT, "get_grants")) {
  const ask = g.ask_id === null || g.ask_id === undefined ? "" : ` answering ask #${g.ask_id}`;
  console.log(`  ${g.keeper} → ${g.recipient} ${fmtNear(g.amount_yocto)} NEAR${ask} — "${g.memo}"`);
}
console.log("asks:");
for (const a of await view(CONTRACT, "get_asks")) {
  const st = a.funded_by ? `funded by ${a.funded_by}` : "open";
  console.log(`  #${a.id} ${a.asker} wants ${fmtNear(a.want_yocto)} NEAR — "${a.text}" (${st})`);
}
console.log("donors:");
for (const d of await view(CONTRACT, "get_donors")) {
  console.log(`  ${d.account} ${fmtNear(d.total_yocto)} NEAR`);
}
console.log("voices:");
for (const v of await view(CONTRACT, "get_voices")) {
  console.log(`  round ${v.round} · ${v.keeper}: "${v.text}"`);
}
console.log("access keys on the treasury account:");
for (const k of await accessKeys(CONTRACT)) {
  const scope = k.full
    ? "FULL ACCESS"
    : `receiver=${k.scoped?.receiver} methods=[${k.scoped?.methods?.join(",")}] allowance=${k.scoped?.allowance}`;
  console.log(`  ${k.publicKey} → ${scope}`);
}
