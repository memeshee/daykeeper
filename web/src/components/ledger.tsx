import { formatNear, short } from "@/lib/chain";
import type { Grant, Keeper } from "@/lib/chain";

const stamp = (ns: number | string) =>
  new Date(Number(ns) / 1e6).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

export function Ledger({ keepers, grants }: { keepers: Keeper[]; grants: Grant[] }) {
  const ks = [...keepers].reverse();
  const gs = [...grants].reverse();

  return (
    <section className="border-t rule pt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="label">the ledger</h2>
        <span className="label">
          {keepers.length} keeper{keepers.length === 1 ? "" : "s"} · {grants.length} grant
          {grants.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <div>
          <h3 className="label mb-3">keepers</h3>
          {ks.length === 0 ? (
            <p className="text-[13px] text-ink-faint italic">
              Nobody has held the seat yet. The first name here pays for the privilege.
            </p>
          ) : (
            <ol>
              {ks.map((k) => (
                <li
                  key={`${k.round}-${k.account}`}
                  className="ledger-row grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 py-2 text-[12.5px]"
                >
                  <span className="numeral text-ink-faint">{String(k.round).padStart(2, "0")}</span>
                  <span className="text-ink">
                    {short(k.account)}
                    <span className="ml-2 text-ink-faint">{stamp(k.since_ns)} UTC</span>
                  </span>
                  <span className="numeral text-ink-soft">{formatNear(k.paid_yocto, 3)} N</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h3 className="label mb-3">grants</h3>
          {gs.length === 0 ? (
            <p className="text-[13px] text-ink-faint italic">
              No grant has been given yet. A keeper&apos;s day is unfinished until one is.
            </p>
          ) : (
            <ol>
              {gs.map((g, i) => (
                <li key={`${g.at_ns}-${i}`} className="ledger-row py-2 text-[12.5px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink">
                      {short(g.keeper)} <span className="text-ink-faint">→</span>{" "}
                      {short(g.recipient)}
                    </span>
                    <span className="numeral text-ink-soft">
                      {formatNear(g.amount_yocto, 4)} N
                    </span>
                  </div>
                  {g.memo ? (
                    <p className="display mt-0.5 text-[15px] italic text-ink-soft">“{g.memo}”</p>
                  ) : null}
                  <p className="text-[11px] text-ink-faint">{stamp(g.at_ns)} UTC</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
