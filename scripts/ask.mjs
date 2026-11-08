// Post a public ask to the treasury. The fee (0.01 NEAR) is not a toll: it goes into the
// pool the ask is asking, so the queue funds the treasury it addresses.
//   node scripts/ask.mjs dk-erin.testnet "bus fare to the interview" 0.3
import { CONTRACT, call, parseNear, view, fmtNear } from "./lib.mjs";

const [signer = "dk-erin.testnet", ...rest] = process.argv.slice(2);
const want = rest.pop();
const text = rest.join(" ");
if (!text || !want) {
  console.error('usage: node scripts/ask.mjs <account> "<what you need>" <amount in NEAR>');
  process.exit(1);
}

const s = await view(CONTRACT, "get_state");
console.log(`pool ${fmtNear(s.pool_yocto)} NEAR · a keeper can give ${fmtNear(s.grant_cap_yocto)} NEAR this round`);

const res = await call({
  signerId: signer,
  method: "request",
  args: { text, want_yocto: parseNear(want).toString() },
  deposit: parseNear("0.01"),
  gas: 30n * 10n ** 12n,
});
console.log(`ask posted → ${res.hash}`);
if (res.logs.length) console.log(res.logs.map((l) => `  · ${l}`).join("\n"));
for (const a of await view(CONTRACT, "get_asks")) {
  const state = a.funded_by ? `funded by ${a.funded_by}` : "open";
  console.log(`  #${a.id} ${a.asker} wants ${fmtNear(a.want_yocto)} NEAR — "${a.text}" (${state})`);
}
