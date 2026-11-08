"use client";

import Link from "next/link";

import { Clock } from "@/components/clock";
import { KeyBox } from "@/components/keybox";
import { Ledger } from "@/components/ledger";
import { Asks, Donors } from "@/components/queue";
import { Seat } from "@/components/seat";
import { Voices } from "@/components/voices";
import { CONTRACT, NETWORK, explorerAccount, formatNear, short } from "@/lib/chain";
import { useChain } from "@/lib/use-chain";

export default function Home() {
  const { state, keepers, grants, voices, asks, donors, error, offsetMs } = useChain();

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1180px] px-5 pb-16 sm:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3 py-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[15px] font-medium tracking-[0.22em]">DAYKEEPER</h1>
          <span className="display text-[15px] italic text-ink-soft">
            a public treasury with a new keeper every day
          </span>
        </div>
        <div className="flex items-baseline gap-4 text-[11px]">
          <span className="label">{NETWORK}</span>
          <a
            href={explorerAccount(CONTRACT)}
            target="_blank"
            rel="noreferrer"
            className="numeral text-ink-soft hover:text-signal"
          >
            {CONTRACT} ↗
          </a>
        </div>
      </header>

      {error ? (
        <div className="border-t rule py-10">
          <p className="label text-signal">the treasury did not answer</p>
          <p className="mt-2 text-[13px] text-ink-soft">{error}</p>
          <p className="mt-2 text-[12px] text-ink-faint">
            If the contract was just redeployed it may not be initialised yet: run{" "}
            <code className="text-ink">node scripts/deploy.mjs</code>.
          </p>
        </div>
      ) : !state ? (
        <div className="border-t rule py-10">
          <p className="label">reading the treasury…</p>
          <div className="mt-4 h-[2px] w-1/3 animate-pulse bg-rule" />
        </div>
      ) : (
        <>
          {/* hero */}
          <section className="grid gap-8 border-t rule pt-8 md:grid-cols-[1.55fr_1fr] md:gap-14">
            <div>
              <div className="flex items-baseline gap-4">
                <span className="label">round {String(state.round).padStart(2, "0")}</span>
                <span className={`label ${state.awaiting_settle ? "text-signal" : "text-sage"}`}>
                  {state.awaiting_settle ? "the bell may be rung" : "bidding open"}
                </span>
              </div>
              <div className="mt-3">
                <Clock
                  roundEndNs={state.round_end_ns}
                  offsetMs={offsetMs}
                  roundSecs={state.round_secs}
                  awaiting={state.awaiting_settle}
                />
              </div>
              <p className="mt-4 max-w-[48ch] text-[13px] text-ink-soft">
                A round is {state.round_secs} seconds here so you can watch one end; a day on mainnet.
                When it ends, <span className="text-ink">anyone</span> can ring the bell: the highest
                bidder becomes the keeper and the contract installs a key on this account in their name.
              </p>
              <Link
                href="/act"
                className="mt-5 inline-block border border-ink px-4 py-2 text-[11px] tracking-[0.16em] uppercase hover:bg-ink hover:text-paper"
              >
                take the seat from your browser →
              </Link>
            </div>

            <div className="md:border-l md:rule md:pl-8">
              <p className="label">in the pool</p>
              <p
                className="display mt-2 leading-none text-ink"
                style={{ fontSize: "clamp(2.6rem, 6.4vw, 4.6rem)" }}
              >
                {formatNear(state.pool_yocto, 3)}
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">NEAR the keeper cannot spend</p>
              <p className="mt-5 text-[12px] leading-relaxed text-ink-faint">
                One grant leaves per round, and it is{" "}
                <span className="text-ink-soft">{formatNear(state.grant_cap_yocto, 4)} NEAR</span> right now
                — fixed at launch, not a share of the pool. A keeper who bid{" "}
                {formatNear(state.high_bid_yocto, 3)} NEAR can hand out more than they paid, to somebody
                other than themselves.
              </p>
            </div>
          </section>

          <div className="mt-12">
            <Asks asks={asks} />
          </div>

          {/* the two powers */}
          <div className="mt-12 grid gap-10 pb-10 md:grid-cols-2 md:gap-14">
            <Seat state={state} />
            <KeyBox state={state} />
          </div>

          <div className="mt-10">
            <Voices voices={voices} />
          </div>

          <div className="mt-10">
            <Ledger keepers={keepers} grants={grants} />
          </div>

          <div className="mt-10">
            <Donors donors={donors} />
          </div>

          <footer className="mt-14 border-t rule pt-6">
            <p className="display text-[clamp(1.2rem,2.6vw,1.7rem)] leading-snug text-ink">
              The mechanic is not in a backend somebody could switch off. It is in the contract:
              <span className="text-ink-soft italic">
                {" "}
                one auction, one key, one grant, one day.
              </span>
            </p>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[11px]">
              <a
                className="label hover:text-signal"
                href={explorerAccount(CONTRACT)}
                target="_blank"
                rel="noreferrer"
              >
                contract ↗
              </a>
              <a
                className="label hover:text-signal"
                href="https://github.com/PhiBao/daykeeper"
                target="_blank"
                rel="noreferrer"
              >
                repository ↗
              </a>
              <span className="label">
                keeper {short(state.keeper)} · {state.keepers} days given away
              </span>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
