// The control run: four things a keeper must NOT be able to do, each attempted for real
// against the live contract. Every attempt is expected to fail; the refusal is the proof.
//   node scripts/refuse.mjs <grant-key-file> <voice-key-file>
import { readFileSync } from "node:fs";
import { actionCreators } from "@near-js/transactions";
import { CONTRACT, account, call, credentials } from "./lib.mjs";

const [grantFile, voiceFile] = process.argv.slice(2);
if (!grantFile || !voiceFile) {
  console.error("usage: node scripts/refuse.mjs <grant-key-file> <voice-key-file>");
  process.exit(1);
}
const grantKey = readFileSync(grantFile, "utf8").trim();
const voiceKey = readFileSync(voiceFile, "utf8").trim();

const attempts = [];

async function attempt(name, why, fn) {
  try {
    const res = await fn();
    attempts.push({ name, why, refused: false, detail: `NOT REFUSED — tx ${res?.hash ?? ""}` });
  } catch (e) {
    const msg = String(e.message ?? e);
    const kind = e.kind || (e.cause && e.cause.name) || "error";
    attempts.push({ name, why, refused: true, detail: `${kind}: ${msg}`.slice(0, 200) });
  }
}

// 1. the voice key reaches for the money
await attempt("voice key calls grant", "the voice key is scoped to `say`", () =>
  call({
    signerId: CONTRACT,
    secretKey: voiceKey,
    method: "grant",
    args: { recipient: "dk-erin.testnet", memo: "should never land" },
    gas: 40n * 10n ** 12n,
  }),
);

// 2. the grant key reaches for the microphone
await attempt("grant key calls say", "the grant key is scoped to `grant`", () =>
  call({
    signerId: CONTRACT,
    secretKey: grantKey,
    method: "say",
    args: { text: "should never appear" },
    gas: 30n * 10n ** 12n,
  }),
);

// 3. a keeper key tries to move NEAR out of the treasury
await attempt("voice key sends NEAR out", "function-call keys cannot attach NEAR", async () => {
  const acct = await account(CONTRACT, voiceKey);
  const out = await acct.signAndSendTransaction({
    receiverId: "dk-erin.testnet",
    actions: [actionCreators.transfer(1n)],
  });
  return { hash: out.transaction_outcome?.id };
});

// 4. a keeper key tries to call an arbitrary method on the treasury
await attempt("grant key calls donate", "only the scoped method name is allowed", () =>
  call({
    signerId: CONTRACT,
    secretKey: grantKey,
    method: "donate",
    args: {},
    deposit: 1n,
    gas: 10n * 10n ** 12n,
  }),
);

// 5. someone who is not the keeper tries to grant
const outsider = credentials("dk-chen.testnet");
await attempt("outsider calls grant", "predecessor is not the keeper", () =>
  call({
    signerId: "dk-chen.testnet",
    secretKey: outsider.secret,
    method: "grant",
    args: { recipient: "dk-erin.testnet", memo: "not yours to give" },
    gas: 40n * 10n ** 12n,
  }),
);

let ok = 0;
console.log("the control run — five things a keeper must not be able to do\n");
for (const a of attempts) {
  if (a.refused) ok += 1;
  console.log(`${a.refused ? "REFUSED " : "!! FAILED"}  ${a.name}`);
  console.log(`          expected because ${a.why}`);
  console.log(`          ${a.detail}\n`);
}
console.log(`${ok}/${attempts.length} refused`);
process.exit(ok === attempts.length ? 0 : 1);
