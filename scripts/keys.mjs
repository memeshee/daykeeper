// Generate a NEAR keypair and write it where the SDK looks for it.
//   node scripts/keys.mjs alice.dk88e2a1a3.testnet [bruno...]
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { KeyPair } from "@near-js/crypto";
import { NETWORK } from "./lib.mjs";

const dir = join(homedir(), ".near-credentials", NETWORK);
mkdirSync(dir, { recursive: true, mode: 0o700 });

for (const accountId of process.argv.slice(2)) {
  const file = join(dir, `${accountId}.json`);
  if (existsSync(file)) {
    console.log(`exists  ${accountId}`);
    continue;
  }
  const kp = KeyPair.fromRandom("ed25519");
  writeFileSync(
    file,
    JSON.stringify(
      { account_id: accountId, public_key: kp.getPublicKey().toString(), private_key: kp.toString() },
      null,
      1,
    ),
    { mode: 0o600 },
  );
  console.log(`created ${accountId}  ${kp.getPublicKey().toString()}`);
}
