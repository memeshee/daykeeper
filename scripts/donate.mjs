// Put money into the pool and ask for nothing back.
//   node scripts/donate.mjs dk-dave.testnet 2
import { actionCreators } from "@near-js/transactions";
import { CONTRACT, credentials, account, call, parseNear, view, fmtNear } from "./lib.mjs";

const [who = "dk-dave.testnet", amount = "1"] = process.argv.slice(2);
const accountId = who.includes(".") ? who : `dk-${who}.testnet`;
const c = credentials(accountId);

const res = await call({
  signerId: accountId,
  secretKey: c.secret,
  method: "donate",
  args: {},
  deposit: parseNear(amount),
  gas: 20n * 10n ** 12n,
});
console.log(`donated ${amount} NEAR from ${accountId} → ${res.hash}`);
const s = await view(CONTRACT, "get_state");
console.log(`pool ${fmtNear(s.pool_yocto)} NEAR · grant cap ${fmtNear(s.grant_cap_yocto)} NEAR`);
