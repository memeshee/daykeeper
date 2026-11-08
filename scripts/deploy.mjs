// Deploy Daykeeper. Creates the treasury account as a sub-account of MASTER when it does
// not exist (the public testnet helper is rate-limited, so we never depend on it), deploys
// the wasm, and initialises the launch parameters — which no method can ever change.
//   node scripts/deploy.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey } from "@near-js/crypto";
import { actionCreators } from "@near-js/transactions";
import { CONTRACT, credentials, fmtNear, account, view, accessKeys, parseNear, balance } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WASM = join(here, "..", "contract", "target", "wasm32-unknown-unknown", "release", "daykeeper.wasm");
const MASTER = process.env.MASTER || "dk-dave.testnet";
const FUND = process.env.FUND || "7";

const roundSecs = Number(process.env.ROUND_SECS || 60);
const floorNear = process.env.PRICE_FLOOR || "0.1";
const stepBps = Number(process.env.STEP_BPS || 1000); // +10% to outbid
const capBps = Number(process.env.CAP_BPS || 500); // 5% of the pool per grant

console.log(`treasury ${CONTRACT} (master ${MASTER})`);

let exists = true;
try {
  await balance(CONTRACT);
} catch {
  exists = false;
}
if (!exists) {
  const m = credentials(MASTER);
  const masterAcct = await account(MASTER, m.secret);
  const res = await masterAcct.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [
      actionCreators.createAccount(),
      actionCreators.transfer(parseNear(FUND)),
      actionCreators.addKey(PublicKey.fromString(credentials(CONTRACT).public), actionCreators.fullAccessKey()),
    ],
  });
  console.log(`  created sub-account with ${FUND} NEAR (${res.transaction_outcome.id})`);
}

const acct = await account(CONTRACT, credentials(CONTRACT).secret);
const wasm = readFileSync(WASM);
const dep = await acct.deployContract(wasm);
console.log(`  deployed ${wasm.length} bytes (${dep.transaction_outcome.id})`);

// An uninitialised contract panics on every view, so `new` is the only call that can work
// here. On a redeploy it is already initialised and we keep the existing state.
try {
  const res = await acct.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [
      actionCreators.functionCall(
        "new",
        Buffer.from(
          JSON.stringify({
            round_secs: roundSecs,
            price_floor_yocto: parseNear(floorNear).toString(),
            step_bps: stepBps,
            cap_bps: capBps,
          }),
        ),
        50n * 10n ** 12n,
        0n,
      ),
    ],
  });
  console.log(
    `  initialised round=${roundSecs}s floor=${floorNear} NEAR step=${stepBps}bps cap=${capBps}bps (${res.transaction_outcome.id})`,
  );
} catch (e) {
  console.log(`  init skipped: ${String(e.message || e).slice(0, 120)}`);
}

const s = await view(CONTRACT, "get_state");
console.log(`\nstate: pool ${fmtNear(s.pool_yocto)} NEAR · min bid ${fmtNear(s.next_min_bid_yocto)} NEAR · round ${s.round}`);
console.log("access keys on the treasury account:");
for (const k of await accessKeys(CONTRACT)) {
  const scope = k.full
    ? "FULL ACCESS"
    : `receiver=${k.scoped?.receiver} methods=[${k.scoped?.methods?.join(",")}] allowance=${fmtNear(k.scoped?.allowance ?? 0, 3)} NEAR`;
  console.log(`  ${k.publicKey} → ${scope}`);
}
