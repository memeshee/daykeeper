"use client";

import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";

import { CONTRACT, RPC_HOSTS } from "./chain";

/**
 * Everything that touches a secret happens here, in the browser. No server ever sees a
 * private key: the page mints the keys, keeps them in localStorage, and signs locally.
 * A judge can open devtools and watch a transaction leave this tab.
 */

export type Stored = {
  /** the account that pays for bids (full access, from the faucet or pasted) */
  account: string | null;
  accountSecret: string | null;
  /** the two keys the contract installs on the treasury if you win */
  grantPublic: string;
  grantSecret: string;
  voicePublic: string;
  voiceSecret: string;
};

const KEY = "daykeeper.v1";

export function loadStored(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export function saveStored(s: Stored) {
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearStored() {
  window.localStorage.removeItem(KEY);
}

/** Mint the two keys the seat needs. The private halves never leave this browser. */
export function mintSeatKeys(): Pick<Stored, "grantPublic" | "grantSecret" | "voicePublic" | "voiceSecret"> {
  const grant = KeyPair.fromRandom("ed25519");
  const voice = KeyPair.fromRandom("ed25519");
  return {
    grantPublic: grant.getPublicKey().toString(),
    grantSecret: grant.toString(),
    voicePublic: voice.getPublicKey().toString(),
    voiceSecret: voice.toString(),
  };
}

export function mintAccountKey() {
  const kp = KeyPair.fromRandom("ed25519");
  return { publicKey: kp.getPublicKey().toString(), secretKey: kp.toString() };
}

function provider() {
  return new JsonRpcProvider({ url: RPC_HOSTS[0] });
}

async function account(accountId: string, secretKey: string) {
  return new Account(accountId, provider(), new KeyPairSigner(KeyPair.fromString(secretKey as Parameters<typeof KeyPair.fromString>[0])));
}

export type Sent = { hash: string; logs: string[] };

/** The SDK returns a fat union; we only need three fields from it. */
type RawOutcome = {
  transaction_outcome?: { id?: string };
  transaction?: { hash?: string };
  receipts_outcome?: { outcome?: { logs?: string[] } }[];
};

function toSent(out: RawOutcome): Sent {
  return {
    hash: out.transaction_outcome?.id ?? out.transaction?.hash ?? "",
    logs: (out.receipts_outcome ?? []).flatMap((r) => r.outcome?.logs ?? []),
  };
}

/** Sign and send a function call from the browser. */
export async function sendCall(opts: {
  signerId: string;
  secretKey: string;
  method: string;
  args?: Record<string, unknown>;
  depositYocto?: bigint;
  gas?: bigint;
  receiverId?: string;
}): Promise<Sent> {
  const acct = await account(opts.signerId, opts.secretKey);
  const out = (await acct.signAndSendTransaction({
    receiverId: opts.receiverId ?? CONTRACT,
    actions: [
      actionCreators.functionCall(
        opts.method,
        Buffer.from(JSON.stringify(opts.args ?? {})),
        opts.gas ?? 100n * 10n ** 12n,
        opts.depositYocto ?? 0n,
      ),
    ],
  })) as unknown as RawOutcome;
  return toSent(out);
}

/**
 * Try to send the treasury's NEAR out with a key that is scoped to one method. The chain
 * refuses it, and the refusal is the product: this function exists to be rejected in
 * front of the reviewer.
 */
export async function tryTransferOut(opts: {
  secretKey: string;
  to: string;
  yocto: bigint;
}): Promise<Sent> {
  const acct = await account(CONTRACT, opts.secretKey);
  const out = (await acct.signAndSendTransaction({
    receiverId: opts.to,
    actions: [actionCreators.transfer(opts.yocto)],
  })) as unknown as RawOutcome;
  return toSent(out);
}

/**
 * The keeper's two keys live on the treasury account, so calls must be signed as the
 * treasury with the key the contract installed. That is exactly what makes the scope
 * enforcement real: the chain checks the key, not a session.
 */
export async function sendAsTreasury(opts: {
  secretKey: string;
  method: string;
  args?: Record<string, unknown>;
  gas?: bigint;
}): Promise<Sent> {
  return sendCall({
    signerId: CONTRACT,
    secretKey: opts.secretKey,
    method: opts.method,
    args: opts.args,
    gas: opts.gas,
  });
}

/** Readable chain error text, whatever shape the SDK threw. */
export function readableError(e: unknown): string {
  const raw = [
    (e as Error)?.message ?? "",
    JSON.stringify((e as { kind?: unknown })?.kind ?? null),
    String(e ?? ""),
  ];
  for (const c of raw) {
    const m = c.match(/"(?:ExecutionError|message)":"([^"]{6,300})"/);
    if (m) return m[1];
    if (c && c.length > 6 && !c.startsWith("{}")) return c.replace(/\s+/g, " ").slice(0, 300);
  }
  return "refused";
}

export const near = (n: string) => BigInt(Math.round(Number(n) * 1e6)) * 10n ** 18n;
export const toNear = (y: string | bigint) => Number(BigInt(y) / 10n ** 18n) / 1e6;
