// Wipe and recreate the treasury account on testnet, so `new()` can run again after a
// schema change. Deleting a NEAR account frees the name immediately.
//   node scripts/fresh.mjs
import { actionCreators } from "@near-js/transactions";
import { CONTRACT, account, credentials, balance, fmtNear } from "./lib.mjs";

const BENEFICIARY = process.env.BENEFICIARY || "dk-dave.testnet";
const creds = credentials(CONTRACT);
const acct = await account(CONTRACT, creds.secret);

// the account may already be gone (a previous wipe, or a failed recreate)
let existed = true;
try {
  const before = await balance(CONTRACT);
  console.log(`deleting ${CONTRACT} (${fmtNear(before)} NEAR → ${BENEFICIARY})`);
  const del = await acct.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actionCreators.deleteAccount(BENEFICIARY)],
  });
  console.log(`  deleted (${del.transaction_outcome.id})`);
} catch (e) {
  existed = false;
  console.log(`  ${CONTRACT} does not exist yet — creating it`);
}
if (existed) console.log("\nnext: node scripts/deploy.mjs   (it recreates the account as a sub-account)");
