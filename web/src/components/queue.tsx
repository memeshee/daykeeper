import { formatNear, short } from "@/lib/chain";
import type { Ask, Donor } from "@/lib/chain";

/**
 * The queue: anyone can ask the treasury for money for a small fee that goes into the pool.
 * The keeper answers one per day. This is what the seat is *for*.
 */
export function Asks({ asks }: { asks: Ask[] }) {
  const open = asks.filter((a) => !a.funded_by).sort((a, b) => b.id - a.id);
  const funded = asks.filter((a) => a.funded_by).sort((a, b) => b.id - a.id);

  return (
    <section className="border-t rule pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label">the queue</h2>
        <span className="label">
          {open.length} open · {funded.length} answered
        </span>
      </div>

      {asks.length === 0 ? (
        <p className="mt-4 max-w-[54ch] text-[13px] text-ink-faint italic">
          Nobody has asked for anything yet. Posting an ask costs 0.01 NEAR and that fee goes into the
          pool it is asking — the queue funds the treasury.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {open.slice(0, 5).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b rule pb-3">
                <span className="max-w-[62ch] text-[13px] text-ink">
                  <span className="numeral text-ink-faint">#{String(a.id).padStart(2, "0")}</span> “{a.text}”
                </span>
                <span className="text-[11px] text-ink-faint">
                  {short(a.asker)} asks{" "}
                  <span className="numeral text-ink-soft">{formatNear(a.want_yocto, 2)} NEAR</span> · open
                </span>
              </li>
            ))}
          </ul>

          {funded.length > 0 && (
            <ul className="mt-4 space-y-2">
              {funded.slice(0, 3).map((a) => (
                <li key={a.id} className="text-[12px] text-ink-faint">
                  <span className="numeral">#{String(a.id).padStart(2, "0")}</span> “{a.text}” —{" "}
                  <span className="text-ink-soft">funded by {short(a.funded_by)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** Giving in public is the point, so donors get a receipt. */
export function Donors({ donors }: { donors: Donor[] }) {
  if (donors.length === 0) return null;
  const total = donors.reduce((sum, d) => sum + Number(d.total_yocto), 0);

  return (
    <section className="border-t rule pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label">who put money in</h2>
        <span className="label">
          {donors.length} donor{donors.length === 1 ? "" : "s"} ·{" "}
          <span className="numeral">{formatNear(String(total), 2)} NEAR</span> donated, all time
        </span>
      </div>
      <ul className="mt-4 space-y-2">
        {donors.slice(0, 6).map((d) => (
          <li key={d.account} className="flex items-baseline justify-between border-b rule pb-2 text-[12px]">
            <span className="numeral text-ink-soft">{short(d.account)}</span>
            <span className="numeral text-ink">{formatNear(d.total_yocto, 3)} NEAR</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
