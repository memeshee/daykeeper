import { short } from "@/lib/chain";
import type { Voice } from "@/lib/chain";

const stamp = (ns: number | string) =>
  new Date(Number(ns) / 1e6).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

/**
 * The treasury's own words. Every keeper gets one key that can call `say`, so the object
 * has a voice while it is held — and goes quiet when the key is revoked.
 */
export function Voices({ voices }: { voices: Voice[] }) {
  const latest = [...voices].reverse();

  return (
    <section className="border-t rule pt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="label">the treasury speaks</h2>
        <span className="label">
          {voices.length} thing{voices.length === 1 ? "" : "s"} said, forever
        </span>
      </div>

      {latest.length === 0 ? (
        <p className="mt-5 max-w-[52ch] text-[13px] text-ink-faint italic">
          Nothing yet. When someone holds the seat they can post here as the treasury — and
          when their day ends, the contract deletes the key that let them.
        </p>
      ) : (
        <ol className="mt-5 space-y-6">
          {latest.slice(0, 4).map((v, i) => (
            <li key={`${v.at_ns}-${i}`} className="ledger-row pt-5">
              <p className="display text-[clamp(1.15rem,2.4vw,1.6rem)] leading-snug text-ink">
                “{v.text}”
              </p>
              <p className="mt-2 text-[11px] text-ink-faint">
                round {String(v.round).padStart(2, "0")} · {short(v.keeper)} · {stamp(v.at_ns)} UTC
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
