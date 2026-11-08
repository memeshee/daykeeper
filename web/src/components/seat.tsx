import { formatNear, short } from "@/lib/chain";
import type { State } from "@/lib/chain";

export function Seat({ state }: { state: State }) {
  const leading = state.high_bidder;
  const isMine = false;
  return (
    <section className="border-t rule pt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="label">the seat</h2>
        <span className="label">{state.step_bps / 100}% to outbid</span>
      </div>

      <p className="display mt-3 text-[clamp(1.35rem,2.4vw,1.9rem)] leading-tight">
        Bid for the next day.
        <br />
        <span className="text-ink-soft italic">
          If someone outbids you, the contract sends your money straight back.
        </span>
      </p>

      <dl className="mt-6 space-y-2 text-[13px]">
        <div className="flex justify-between border-b rule pb-2">
          <dt className="text-ink-faint">minimum next bid</dt>
          <dd className="numeral text-ink">{formatNear(state.next_min_bid_yocto, 4)} NEAR</dd>
        </div>
        <div className="flex justify-between border-b rule pb-2">
          <dt className="text-ink-faint">leading bid</dt>
          <dd className="numeral text-ink">
            {formatNear(state.high_bid_yocto, 4)} NEAR
            {leading ? <span className="text-ink-faint"> · {short(leading)}</span> : null}
          </dd>
        </div>
        <div className="flex justify-between border-b rule pb-2">
          <dt className="text-ink-faint">the keeper may hand out</dt>
          <dd className="numeral text-ink">{formatNear(state.grant_cap_yocto, 4)} NEAR</dd>
        </div>
      </dl>

      <div className="mt-6 border rule bg-paper-raised p-4">
        <p className="label">bid from the command line</p>
        <pre className="mt-2 overflow-x-auto text-[12px] leading-relaxed text-ink-soft">
{`node scripts/bid.mjs dk-alice.testnet ${formatNear(state.next_min_bid_yocto, 3)} --new-key`}
        </pre>
        <p className="mt-3 text-[12px] text-ink-faint">
          <code className="text-ink">--new-key</code> mints a fresh keypair locally. Its public
          half goes into the bid; if you win, the contract installs it on the treasury and you get
          the private half to keep. Your wallet is never asked for anything.
        </p>
      </div>

      <p className="mt-4 text-[12px] text-ink-faint">
        Wallet bidding is deliberately not wired to a hosted signer: this deployment is
        judgement-ready on testnet, and the CLI path is the auditable one.
        {isMine ? "" : ""}
      </p>
    </section>
  );
}
