// Speak as the treasury, using only the voice key the contract installed.
// The key is scoped to this contract and to the method `say`. It cannot attach NEAR.
//   node scripts/say.mjs .keeper-voice-dk-alice.testnet "the first thing I did was give it away"
import { readFileSync } from "node:fs";
import { CONTRACT, call } from "./lib.mjs";

const [keyFile, ...words] = process.argv.slice(2);
if (!keyFile) {
  console.error("usage: node scripts/say.mjs <voice-key-file> <text>");
  process.exit(1);
}
const text = words.join(" ") || "gm from the treasury";
const voiceKey = readFileSync(keyFile, "utf8").trim();

const res = await call({
  signerId: CONTRACT,
  secretKey: voiceKey,
  method: "say",
  args: { text },
  gas: 10n * 10n ** 12n,
});
console.log(`said → ${res.hash}`);
if (res.logs.length) console.log(res.logs.map((l) => `  · ${l}`).join("\n"));
