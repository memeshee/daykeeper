import { NextResponse } from "next/server";

/**
 * A small testnet faucet so a reviewer can take the seat without installing anything.
 *
 * The page mints its own keys client-side and sends only the PUBLIC half here; this route
 * creates `seat-xxxx.dk-dave.testnet` with that key and funds it. No secret is generated on
 * or returned by the server, and the server's own master key never leaves this function.
 *
 * It is deliberately small and rate limited: a shared demo budget, not a service.
 *
 */

const RPC = process.env.NEAR_RPC || "https://near-testnet.drpc.org";
const MASTER = process.env.DAYKEEPER_FAUCET_ACCOUNT || "dk-dave.testnet";
const FUND_NEAR = Number(process.env.DAYKEEPER_FAUCET_FUND || "1.5");

// best effort only: serverless instances do not share this map, and it is not a security
// boundary. The real boundary is the master account's balance.
const recent = new Map<string, number[]>();
const PER_IP_MS = 10 * 60 * 1000;
const PER_IP_MAX = 3; // a judge, a demo recorder and a curious friend can share one IP
let created = 0;
const MAX_PER_INSTANCE = 40;

async function rpc(method: string, params: unknown) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "daykeeper-faucet", method, params }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "rpc error");
  return json.result;
}

export async function POST(req: Request) {
  const master = process.env.DAYKEEPER_FAUCET_KEY;
  if (!master) {
    return NextResponse.json(
      { error: "the demo faucet is not configured on this deployment — paste your own testnet key instead" },
      { status: 503 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < PER_IP_MS);
  if (hits.length >= PER_IP_MAX) {
    const waitMins = Math.max(1, Math.ceil((PER_IP_MS - (now - hits[0])) / 60000));
    return NextResponse.json(
      {
        error: `this address already took ${PER_IP_MAX} seat accounts; try again in about ${waitMins} minute${waitMins === 1 ? "" : "s"}, or paste your own testnet key below`,
      },
      { status: 429 },
    );
  }
  if (created >= MAX_PER_INSTANCE) {
    return NextResponse.json({ error: "the demo faucet is out of seats for now" }, { status: 429 });
  }

  let publicKey = "";
  try {
    const body = await req.json();
    publicKey = String(body?.publicKey ?? "");
  } catch {
    return NextResponse.json({ error: "expected { publicKey }" }, { status: 400 });
  }
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(publicKey)) {
    return NextResponse.json({ error: "publicKey must look like ed25519:<base58>" }, { status: 400 });
  }

  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const accountId = `seat-${nonce}.${MASTER}`;
  const deposit = BigInt(Math.round(FUND_NEAR * 1e6)) * 10n ** 18n;

  // hand-build the transaction: three actions, one signature, no SDK dependency here
  const { KeyPair } = await import("@near-js/crypto");
  const { KeyPairSigner } = await import("@near-js/signers");
  const { Account } = await import("@near-js/accounts");
  const { JsonRpcProvider } = await import("@near-js/providers");
  const { actionCreators } = await import("@near-js/transactions");
  const { PublicKey } = await import("@near-js/crypto");

  try {
    const signer = new KeyPairSigner(KeyPair.fromString(master as Parameters<typeof KeyPair.fromString>[0]));
    const acct = new Account(MASTER, new JsonRpcProvider({ url: RPC }), signer);
    const out = await acct.signAndSendTransaction({
      receiverId: accountId,
      actions: [
        actionCreators.createAccount(),
        actionCreators.transfer(deposit),
        actionCreators.addKey(PublicKey.fromString(publicKey), actionCreators.fullAccessKey()),
      ],
    });
    recent.set(ip, [...hits, Date.now()]);
    created += 1;
    return NextResponse.json({
      accountId,
      fundedNear: FUND_NEAR,
      hash: out.transaction_outcome?.id ?? out.transaction?.hash ?? "",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `could not create the seat account: ${(e as Error).message?.slice(0, 200)}` },
      { status: 502 },
    );
  }
}

export async function GET() {
  try {
    const res = await rpc("query", {
      request_type: "view_account",
      finality: "final",
      account_id: MASTER,
    });
    return NextResponse.json({ master: MASTER, balanceYocto: res.amount, fundNear: FUND_NEAR });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
