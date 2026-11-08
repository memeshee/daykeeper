// Move testnet NEAR around so the treasury has room for its own code.
//   node scripts/fund.mjs
import { actionCreators } from "@near-js/transactions";
import { balance, account, credentials, fmtNear } from "./lib.mjs";

const TREASURY = process.env.DAYKEEPER_CONTRACT || "daykeeper-commons.testnet";
const WANT = 6n * 10n ** 24n; // 6 NEAR: ~3.4 goes to storing the contract code
const DONORS = ["dk-dave.testnet", "dk-erin.testnet", "dk-chen.testnet"];

async function send(fromId, toId, amount) {
  const c = credentials(fromId);
  const acct = await account(fromId, c.secret);
  const res = await acct.signAndSendTransaction({
    receiverId: toId,
    actions: [actionCreators.transfer(amount)],
  });
  return res.transaction_outcome.id;
}

let have = BigInt(await balance(TREASURY));
console.log(`${TREASURY} holds ${fmtNear(have)} NEAR`);
for (const donor of DONORS) {
  if (have >= WANT) break;
  const donorBal = BigInt(await balance(donor));
  const spare = donorBal > 5n * 10n ** 23n ? donorBal - 5n * 10n ** 23n : 0n; // keep 0.5
  if (spare <= 0n) {
    console.log(`  ${donor} has nothing spare (${fmtNear(donorBal)})`);
    continue;
  }
  const send9 = spare < WANT - have ? spare : WANT - have;
  const hash = await send(donor, TREASURY, send9);
  have += send9;
  console.log(`  ${donor} → ${TREASURY} ${fmtNear(send9)} NEAR  ${hash}`);
}
console.log(`final: ${TREASURY} holds ${fmtNear(await balance(TREASURY))} NEAR`);
