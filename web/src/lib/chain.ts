// Read-only chain access for the page. Everything visible here comes from the
// contract itself: if the numbers move, the contract moved them.

export const NETWORK = process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet";
export const CONTRACT =
  process.env.NEXT_PUBLIC_DAYKEEPER_CONTRACT ?? "commons.dk-dave.testnet";

// Browsers need a CORS-friendly RPC. rpc.testnet.near.org refuses cross-origin reads, so
// FastNear goes first and the others are fallbacks if a host is down or throttled.
export const RPC_HOSTS = [
  process.env.NEXT_PUBLIC_NEAR_RPC,
  NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://near-testnet.drpc.org",
  NETWORK === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.fastnear.com",
].filter(Boolean) as string[];

export type State = {
  treasury: string;
  pool_yocto: string;
  round: number;
  round_end_ns: number;
  now_ns: number;
  price_floor_yocto: string;
  next_min_bid_yocto: string;
  high_bid_yocto: string;
  high_bidder: string | null;
  awaiting_settle: boolean;
  keeper: string | null;
  grant_key: string | null;
  voice_key: string | null;
  keeper_grants_left: number;
  /** the most the keeper may give today: min(give, pool) */
  grant_cap_yocto: string;
  /** the absolute grant size, fixed at launch */
  give_yocto: string;
  round_secs: number;
  step_bps: number;
  keepers: number;
  grants: number;
  voices: number;
  asks: number;
  open_asks: number;
  donors: number;
};

export type Keeper = {
  account: string;
  paid_yocto: string;
  round: number;
  since_ns: number;
  grants_made: number;
  words_spoken: number;
};

export type Voice = {
  keeper: string;
  text: string;
  at_ns: number;
  round: number;
};

export type Grant = {
  keeper: string;
  recipient: string;
  amount_yocto: string;
  memo: string;
  at_ns: number;
  ask_id: number | null;
};

export type Ask = {
  id: number;
  asker: string;
  text: string;
  want_yocto: string;
  at_ns: number;
  round: number;
  funded_by: string | null;
};

export type Donor = {
  account: string;
  total_yocto: string;
};

async function rpc<T>(body: unknown): Promise<T> {
  let last = "no rpc host answered";
  for (const host of RPC_HOSTS) {
    try {
      const res = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "daykeeper-web", ...(body as object) }),
        cache: "no-store",
      });
      const json = await res.json();
      if (json.error) {
        // a protocol answer, not a transport failure: surface it instead of retrying
        throw Object.assign(
          new Error(json.error.cause?.info?.error_message ?? json.error.message ?? "rpc error"),
          { final: true },
        );
      }
      return json.result as T;
    } catch (e) {
      if ((e as { final?: boolean }).final) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(last);
}

export async function view<A = Record<string, unknown>, R = unknown>(
  method: string,
  args: A = {} as A,
): Promise<R> {
  const result = await rpc<{ result?: number[] }>({
    method: "query",
    params: {
      request_type: "call_function",
      finality: "optimistic",
      account_id: CONTRACT,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
    },
  });
  if (!result.result || result.result.length === 0) return null as R;
  const text = new TextDecoder().decode(new Uint8Array(result.result));
  return JSON.parse(text) as R;
}

export async function accessKeys() {
  const r = await rpc<{
    keys: {
      public_key: string;
      access_key: {
        permission:
          | "FullAccess"
          | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };
      };
    }[];
  }>({
    method: "query",
    params: { request_type: "view_access_key_list", finality: "final", account_id: CONTRACT },
  });
  return r.keys.map((k) => {
    const p = k.access_key.permission;
    if (p === "FullAccess") return { publicKey: k.public_key, full: true, scoped: null };
    return {
      publicKey: k.public_key,
      full: false,
      scoped: {
        receiver: p.FunctionCall.receiver_id,
        methods: p.FunctionCall.method_names,
        allowance: p.FunctionCall.allowance,
      },
    };
  });
}

export const yoctoToNear = (y: string | number) => Number(y) / 1e24;

export const formatNear = (y: string | number, digits = 2) =>
  yoctoToNear(y).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const short = (account: string | null | undefined) =>
  account ? account.replace(".testnet", "").replace(".near", "") : "—";

export const shortKey = (key: string | null | undefined) =>
  key ? `${key.slice(0, 12)}…${key.slice(-6)}` : "—";

export function explorerTx(hash: string) {
  return NETWORK === "mainnet"
    ? `https://nearblocks.io/txns/${hash}`
    : `https://testnet.nearblocks.io/txns/${hash}`;
}

export function explorerAccount(account: string) {
  return NETWORK === "mainnet"
    ? `https://nearblocks.io/address/${account}`
    : `https://testnet.nearblocks.io/address/${account}`;
}


