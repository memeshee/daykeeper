"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CONTRACT, NETWORK, explorerAccount, explorerTx, formatNear, short, shortKey } from "@/lib/chain";
import { useChain } from "@/lib/use-chain";
import {
  clearStored,
  loadStored,
  mintAccountKey,
  mintSeatKeys,
  near,
  readableError,
  saveStored,
  sendAsTreasury,
  sendCall,
  tryTransferOut,
  type Stored,
} from "@/lib/signer";

const OUTSIDER = "dk-erin.testnet";

type Entry = { kind: "ok" | "refused" | "info"; text: string; hash?: string };

export default function Act() {
  const { state, asks, error } = useChain();
  const [store, setStore] = useState<Stored | null>(null);
  const [log, setLog] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [bid, setBid] = useState("");
  const [words, setWords] = useState("");
  const [pasteAccount, setPasteAccount] = useState("");
  const [pasteKey, setPasteKey] = useState("");
  const [askText, setAskText] = useState("");
  const [askWant, setAskWant] = useState("0.3");

  useEffect(() => setStore(loadStored()), []);

  const push = (e: Entry) => setLog((prev) => [e, ...prev].slice(0, 24));

  const iHoldGrant = !!store && !!state && state.grant_key === store.grantPublic;
  const iHoldVoice = !!store && !!state && state.voice_key === store.voicePublic;
  const myDay = iHoldGrant || iHoldVoice;
  const myDayOver =
    !!store &&
    !myDay &&
    !!state &&
    (state.grant_key === null || state.grant_key !== store.grantPublic) &&
    log.some((l) => l.kind === "ok" && l.text.startsWith("the seat is"));

  const openAsks = useMemo(() => (asks ?? []).filter((a) => !a.funded_by), [asks]);
  const minBid = state ? formatNear(state.next_min_bid_yocto, 3) : "…";

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      push({ kind: "refused", text: `${label} → ${readableError(e)}` });
    } finally {
      setBusy(null);
    }
  }

  // ---- steps -----------------------------------------------------------

  const mintKeys = () =>
    run("minting two keys", async () => {
      const keys = mintSeatKeys();
      const next: Stored = { account: null, accountSecret: null, ...keys };
      saveStored(next);
      setStore(next);
      push({ kind: "info", text: `minted grant + voice keys — the private halves are in this browser only` });
    });

  const takeFaucetAccount = () =>
    run("asking the demo faucet for an account", async () => {
      const { publicKey, secretKey } = mintAccountKey();
      const res = await fetch("/api/seat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "the faucet refused");
      const next: Stored = {
        ...(store as Stored),
        account: json.accountId,
        accountSecret: secretKey,
      };
      saveStored(next);
      setStore(next);
      push({ kind: "info", text: `the faucet created ${json.accountId} with ${json.fundedNear} testnet NEAR` });
    });

  const usePastedAccount = () =>
    run("using the pasted account", async () => {
      const next: Stored = { ...(store as Stored), account: pasteAccount.trim(), accountSecret: pasteKey.trim() };
      saveStored(next);
      setStore(next);
      setPasteAccount("");
      setPasteKey("");
      push({ kind: "info", text: `bidding as ${next.account}` });
    });

  const placeBid = () =>
    run("bidding", async () => {
      const s = store as Stored;
      const amount = bid || (state ? formatNear(state.next_min_bid_yocto, 3) : "0.1");
      const sent = await sendCall({
        signerId: s.account as string,
        secretKey: s.accountSecret as string,
        method: "bid",
        args: { grant_key: s.grantPublic, voice_key: s.voicePublic },
        depositYocto: near(amount),
        gas: 100n * 10n ** 12n,
      });
      push({ kind: "ok", text: `bid ${amount} NEAR as ${s.account}`, hash: sent.hash });
      push({
        kind: "info",
        text: `if nobody outbids you, ${s.grantPublic.slice(0, 14)}… becomes the treasury's grant key at the bell`,
      });
    });

  const ringTheBell = () =>
    run("ringing the bell", async () => {
      const s = store as Stored;
      const sent = await sendCall({
        signerId: s.account as string,
        secretKey: s.accountSecret as string,
        method: "settle",
        args: {},
        gas: 60n * 10n ** 12n,
      });
      push({
        kind: "ok",
        text: "rang the bell — the contract revoked the old keys and installed the winner's",
        hash: sent.hash,
      });
    });

  const postAsk = () =>
    run("posting an ask", async () => {
      const s = store as Stored;
      const sent = await sendCall({
        signerId: s.account as string,
        secretKey: s.accountSecret as string,
        method: "request",
        args: { text: askText, want_yocto: near(askWant).toString() },
        depositYocto: near("0.01"),
        gas: 30n * 10n ** 12n,
      });
      setAskText("");
      push({
        kind: "ok",
        text: `posted an ask for ${askWant} NEAR — the 0.01 NEAR fee went into the pool`,
        hash: sent.hash,
      });
    });

  const speak = () =>
    run("speaking as the treasury", async () => {
      const s = store as Stored;
      const sent = await sendAsTreasury({
        secretKey: s.voiceSecret,
        method: "say",
        args: { text: words },
        gas: 20n * 10n ** 12n,
      });
      setWords("");
      push({ kind: "ok", text: "the treasury spoke", hash: sent.hash });
    });

  const fundAsk = (id: number, asker: string) =>
    run(`answering ask #${id}`, async () => {
      const s = store as Stored;
      const sent = await sendAsTreasury({
        secretKey: s.grantSecret,
        method: "grant",
        args: { ask_id: id, recipient: asker, memo: "funded from the seat, in the browser" },
        gas: 60n * 10n ** 12n,
      });
      push({ kind: "ok", text: `paid ${asker} answering ask #${id}`, hash: sent.hash });
    });

  const tryTake = (which: "voice" | "grant") =>
    run("trying to move the pool out with a scoped key", async () => {
      const s = store as Stored;
      await tryTransferOut({
        secretKey: which === "voice" ? s.voiceSecret : s.grantSecret,
        to: s.account as string,
        yocto: 1n,
      });
      push({
        kind: "refused",
        text: "NOT REFUSED — that should not be possible. The pool moved.",
      });
    });

  const trySelfGrant = () =>
    run("trying to grant to myself", async () => {
      const s = store as Stored;
      await sendAsTreasury({
        secretKey: s.grantSecret,
        method: "grant",
        args: { ask_id: null, recipient: s.account, memo: "to me" },
        gas: 60n * 10n ** 12n,
      });
      push({ kind: "refused", text: "NOT REFUSED — the keeper paid themselves." });
    });

  const tryTwice = () =>
    run("granting in the same day a second time", async () => {
      const s = store as Stored;
      const sent = await sendAsTreasury({
        secretKey: s.grantSecret,
        method: "grant",
        args: { ask_id: null, recipient: OUTSIDER, memo: "a stranger, from the seat" },
        gas: 60n * 10n ** 12n,
      });
      push({ kind: "ok", text: `paid ${OUTSIDER} — that was the day's one grant`, hash: sent.hash });
      push({ kind: "info", text: "press it again: the second one in the same day must be refused" });
    });

  const reset = () => {
    clearStored();
    setStore(null);
    setLog([]);
  };

  // ---- render ----------------------------------------------------------

  const money = (y: string) => formatNear(y, 3);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1180px] px-5 pb-20 sm:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3 py-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <Link href="/" className="text-[15px] font-medium tracking-[0.22em] hover:text-signal">
            DAYKEEPER
          </Link>
          <span className="display text-[15px] italic text-ink-soft">take the seat, from this tab</span>
        </div>
        <div className="flex items-baseline gap-4 text-[11px]">
          <span className="label">{NETWORK}</span>
          <a className="numeral text-ink-soft hover:text-signal" href={explorerAccount(CONTRACT)} target="_blank" rel="noreferrer">
            {CONTRACT} ↗
          </a>
        </div>
      </header>

      {error && (
        <div className="border-t rule py-8">
          <p className="label text-signal">the treasury did not answer</p>
          <p className="mt-2 text-[13px] text-ink-soft">{error}</p>
        </div>
      )}

      {/* live strip */}
      <section className="grid gap-6 border-t rule py-6 sm:grid-cols-4">
        <div>
          <p className="label">round</p>
          <p className="numeral mt-1 text-[15px]">{state ? String(state.round).padStart(2, "0") : "—"}</p>
        </div>
        <div>
          <p className="label">in the pool</p>
          <p className="numeral mt-1 text-[15px]">{state ? money(state.pool_yocto) : "—"} NEAR</p>
        </div>
        <div>
          <p className="label">a keeper can give</p>
          <p className="numeral mt-1 text-[15px]">{state ? money(state.grant_cap_yocto) : "—"} NEAR</p>
        </div>
        <div>
          <p className="label">the seat</p>
          <p className="numeral mt-1 text-[15px]">
            {myDay ? <span className="text-sage">yours</span> : state?.keeper ? short(state.keeper) : "vacant"}
          </p>
        </div>
      </section>

      {state?.awaiting_settle && (
        <section className="border-t rule py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="label text-signal">the round is over — anyone may ring the bell</p>
              <p className="mt-1 max-w-[58ch] text-[12px] text-ink-soft">
                Ringing it revokes the outgoing keeper&apos;s keys, installs the winner&apos;s, and opens the
                next round. It is permissionless: you do not need to be the winner, or anyone at all.
              </p>
            </div>
            <button
              onClick={ringTheBell}
              disabled={busy !== null || !store?.account}
              className="border border-signal px-4 py-2 text-[11px] tracking-[0.16em] uppercase text-signal hover:bg-signal hover:text-paper disabled:opacity-40"
            >
              {busy === "ringing the bell" ? "ringing…" : "ring the bell"}
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-12 border-t rule pt-8 md:grid-cols-[1.15fr_0.85fr] md:gap-14">
        {/* left: the steps */}
        <div className="space-y-10">
          {/* 1 keys */}
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="label">1 · two keys, minted here</h2>
              {store && <span className="label text-sage">done</span>}
            </div>
            {!store ? (
              <>
                <p className="mt-3 max-w-[52ch] text-[13px] text-ink-soft">
                  The seat is not a session and not a login. If you win, the contract installs two keys on
                  the treasury account: one may call <code className="text-ink">grant</code>, one may call{" "}
                  <code className="text-ink">say</code>. Mint them now — the private halves never leave this
                  browser.
                </p>
                <button
                  onClick={mintKeys}
                  disabled={busy !== null}
                  className="mt-4 border border-ink px-4 py-2 text-[11px] tracking-[0.16em] uppercase hover:bg-ink hover:text-paper disabled:opacity-40"
                >
                  {busy ? "working…" : "mint my grant + voice keys"}
                </button>
              </>
            ) : (
              <dl className="mt-3 space-y-1 text-[12px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-faint">grant key</dt>
                  <dd className="numeral text-ink-soft">{shortKey(store.grantPublic)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-faint">voice key</dt>
                  <dd className="numeral text-ink-soft">{shortKey(store.voicePublic)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-faint">installed on the treasury</dt>
                  <dd className={`numeral ${myDay ? "text-sage" : "text-ink-faint"}`}>
                    {iHoldGrant ? "grant live" : "grant not yet"}
                    {" · "}
                    {iHoldVoice ? "voice live" : "voice not yet"}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          {/* 2 account */}
          {store && (
            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="label">2 · an account to bid with</h2>
                {store.account && <span className="label text-sage">{short(store.account)}</span>}
              </div>
              {store.account ? (
                <p className="mt-3 text-[13px] text-ink-soft">
                  Bidding as <span className="numeral text-ink">{store.account}</span>.{" "}
                  <a
                    className="label underline decoration-rule hover:text-signal"
                    href={explorerAccount(store.account)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    look it up ↗
                  </a>
                </p>
              ) : (
                <div className="mt-3 space-y-4">
                  <p className="max-w-[52ch] text-[13px] text-ink-soft">
                    A bid costs NEAR, so you need a funded testnet account. Two ways, both fine:
                  </p>
                  <button
                    onClick={takeFaucetAccount}
                    disabled={busy !== null}
                    className="border border-ink px-4 py-2 text-[11px] tracking-[0.16em] uppercase hover:bg-ink hover:text-paper disabled:opacity-40"
                  >
                    {busy === "asking the demo faucet for an account" ? "creating…" : "give me a funded testnet account"}
                  </button>
                  <p className="text-[11px] text-ink-faint">
                    A shared demo faucet on testnet money, rate limited and small. Nothing of yours is used.
                  </p>
                  <div className="border-t rule pt-4">
                    <p className="label">or paste your own testnet account</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        value={pasteAccount}
                        onChange={(e) => setPasteAccount(e.target.value)}
                        placeholder="you.testnet"
                        className="min-w-[10rem] flex-1 border border-rule bg-transparent px-2 py-1 text-[12px] outline-none focus:border-ink"
                      />
                      <input
                        value={pasteKey}
                        onChange={(e) => setPasteKey(e.target.value)}
                        placeholder="ed25519:private-key"
                        type="password"
                        className="min-w-[12rem] flex-[2] border border-rule bg-transparent px-2 py-1 text-[12px] outline-none focus:border-ink"
                      />
                      <button
                        onClick={usePastedAccount}
                        disabled={busy !== null || !pasteAccount || !pasteKey}
                        className="border border-rule px-3 py-1 text-[11px] tracking-[0.12em] uppercase hover:border-ink disabled:opacity-40"
                      >
                        use it
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-ink-faint">
                      Use a throwaway account. The key is signed with in this tab and sent nowhere —
                      but a burnt account is cheaper than a mistake.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 3 bid */}
          {store?.account && (
            <section>
              <h2 className="label">3 · bid for tomorrow</h2>
              <p className="mt-3 max-w-[52ch] text-[13px] text-ink-soft">
                The grant is fixed at launch: today a keeper may hand out{" "}
                <span className="text-ink">{state ? money(state.grant_cap_yocto) : "…"} NEAR</span>. Bid less
                than that and you are buying the right to give away more than you paid. Get outbid and the
                contract sends your money back in the same transaction.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  placeholder={`min ${minBid}`}
                  inputMode="decimal"
                  className="w-32 border border-rule bg-transparent px-2 py-1 text-[12px] outline-none focus:border-ink"
                />
                <span className="label">NEAR</span>
                <button
                  onClick={placeBid}
                  disabled={busy !== null}
                  className="ml-2 border border-ink px-4 py-2 text-[11px] tracking-[0.16em] uppercase hover:bg-ink hover:text-paper disabled:opacity-40"
                >
                  {busy === "bidding" ? "signing…" : "sign and bid"}
                </button>
              </div>
            </section>
          )}

          {/* 4 ask the treasury */}
          {store?.account && (
            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="label">4 · ask the treasury</h2>
                <span className="label">open to anyone</span>
              </div>
              <p className="mt-3 max-w-[54ch] text-[13px] text-ink-soft">
                The keeper funds one ask a day. Posting costs 0.01 NEAR and that fee is not a toll — it
                goes into the pool you are asking, so the queue pays for the money it wants. A keeper
                cannot answer their own ask, or pay anyone other than the account that asked.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  placeholder="what you need it for, in one line"
                  className="min-w-[16rem] flex-1 border border-rule bg-transparent px-2 py-1 text-[12px] outline-none focus:border-ink"
                />
                <input
                  value={askWant}
                  onChange={(e) => setAskWant(e.target.value)}
                  inputMode="decimal"
                  className="w-20 border border-rule bg-transparent px-2 py-1 text-[12px] outline-none focus:border-ink"
                />
                <span className="label">NEAR</span>
                <button
                  onClick={postAsk}
                  disabled={busy !== null || !askText}
                  className="border border-ink px-3 py-1 text-[11px] tracking-[0.12em] uppercase hover:bg-ink hover:text-paper disabled:opacity-40"
                >
                  post it
                </button>
              </div>
            </section>
          )}

          {/* 5 the powers */}
          {store && (
            <section className={myDay ? "" : "opacity-60"}>
              <div className="flex items-baseline justify-between">
                <h2 className="label">5 · the powers, if the seat is yours</h2>
                <span className={`label ${myDay ? "text-sage" : "text-ink-faint"}`}>
                  {myDay ? "unlocked" : "locked until you hold a key"}
                </span>
              </div>

              <p className="mt-3 max-w-[52ch] text-[13px] text-ink-soft">
                These two calls are signed <span className="text-ink">as the treasury</span> with the key the
                contract installed. The chain checks the key, not a login — which is why the same buttons
                stop working the second your day ends.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="label mb-1">speak as the treasury</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={words}
                      onChange={(e) => setWords(e.target.value)}
                      placeholder="why I am funding what I am funding"
                      disabled={!iHoldVoice}
                      className="min-w-[16rem] flex-1 border border-rule bg-transparent px-2 py-1 text-[12px] outline-none focus:border-ink disabled:opacity-50"
                    />
                    <button
                      onClick={speak}
                      disabled={busy !== null || !iHoldVoice || !words}
                      className="border border-ink px-3 py-1 text-[11px] tracking-[0.12em] uppercase hover:bg-ink hover:text-paper disabled:opacity-40"
                    >
                      say it
                    </button>
                  </div>
                </div>

                <div>
                  <p className="label mb-1">answer an open ask</p>
                  {openAsks.length === 0 ? (
                    <p className="text-[12px] text-ink-faint">no open asks right now.</p>
                  ) : (
                    <ul className="space-y-2">
                      {openAsks.slice(0, 4).map((a) => (
                        <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b rule pb-2">
                          <span className="max-w-[36ch] text-[12px] text-ink-soft">
                            <span className="numeral text-ink-faint">#{a.id}</span> “{a.text}”{" "}
                            <span className="numeral">({money(a.want_yocto)} NEAR)</span>
                          </span>
                          <button
                            onClick={() => fundAsk(a.id, a.asker)}
                            disabled={busy !== null || !iHoldGrant || state?.keeper_grants_left === 0}
                            className="border border-rule px-2 py-1 text-[10px] tracking-[0.12em] uppercase hover:border-ink disabled:opacity-40"
                          >
                            fund {short(a.asker)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border-t rule pt-4">
                  <p className="label mb-1">and now try the things you cannot do</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => tryTake("voice")}
                      disabled={busy !== null || !iHoldVoice}
                      className="border border-signal px-3 py-1 text-[10px] tracking-[0.12em] uppercase text-signal hover:bg-signal hover:text-paper disabled:opacity-40"
                    >
                      send the pool to myself
                    </button>
                    <button
                      onClick={trySelfGrant}
                      disabled={busy !== null || !iHoldGrant || state?.keeper_grants_left === 0}
                      className="border border-signal px-3 py-1 text-[10px] tracking-[0.12em] uppercase text-signal hover:bg-signal hover:text-paper disabled:opacity-40"
                    >
                      grant to myself
                    </button>
                    <button
                      onClick={tryTwice}
                      disabled={busy !== null || !iHoldGrant}
                      className="border border-signal px-3 py-1 text-[10px] tracking-[0.12em] uppercase text-signal hover:bg-signal hover:text-paper disabled:opacity-40"
                    >
                      grant twice in one day
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    Both are real transactions, signed with a real key. The refusal below is the chain
                    answering, not this page.
                  </p>
                </div>
              </div>
            </section>
          )}

          {store && (
            <button onClick={reset} className="label underline decoration-rule hover:text-signal">
              forget the keys in this browser
            </button>
          )}
        </div>

        {/* right: what the chain said */}
        <aside>
          <h2 className="label">what the chain said</h2>
          {log.length === 0 ? (
            <p className="mt-3 text-[12px] text-ink-faint italic">
              Nothing yet. Every action you take here prints the plain answer, including the refusals —
              those are the interesting ones.
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {log.map((l, i) => (
                <li key={i} className="border-b rule pb-3">
                  <p
                    className={`text-[12px] leading-relaxed ${
                      l.kind === "refused" ? "text-signal" : l.kind === "ok" ? "text-sage" : "text-ink-soft"
                    }`}
                  >
                    {l.kind === "refused" ? "refused · " : l.kind === "ok" ? "done · " : ""}
                    {l.text}
                  </p>
                  {l.hash && (
                    <a
                      className="label mt-1 inline-block underline decoration-rule hover:text-signal"
                      href={explorerTx(l.hash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {l.hash.slice(0, 16)}… ↗
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}

          {myDayOver && (
            <p className="mt-6 text-[12px] text-ink-soft">
              Your day is over and the contract deleted both keys. The buttons above will now fail with{" "}
              <code className="text-ink">access key does not exist</code> — that is the product working.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
