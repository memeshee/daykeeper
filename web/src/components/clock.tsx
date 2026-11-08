"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function Clock({
  roundEndNs,
  offsetMs,
  roundSecs,
  awaiting,
}: {
  roundEndNs: number;
  offsetMs: number;
  roundSecs: number;
  awaiting: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const chainNow = now + offsetMs;
  const left = Math.max(0, roundEndNs / 1e6 - chainNow);
  const totalSecs = Math.max(1, roundSecs);
  const frac = Math.min(1, Math.max(0, left / (totalSecs * 1000)));

  const s = Math.floor(left / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  return (
    <div>
      <div className="flex items-end gap-4">
        <div
          className="numeral leading-none text-ink"
          style={{ fontSize: "clamp(3.2rem, 11.5vw, 10rem)", letterSpacing: "-0.04em" }}
          aria-label={`${hh} hours ${mm} minutes ${ss} seconds left`}
        >
          {hh > 0 ? `${pad(hh)}:` : ""}
          {pad(mm)}:{pad(ss)}
        </div>
        <div
          className={`mb-3 label ${awaiting ? "text-signal" : "text-ink-faint"}`}
          style={{ writingMode: "vertical-rl" }}
        >
          {awaiting ? "awaiting the bell" : "left in the round"}
        </div>
      </div>

      {/* the round as a printed rule that empties out */}
      <div className="mt-4 h-[2px] w-full bg-rule/60" aria-hidden>
        <div
          className="h-[2px] bg-ink transition-[width] duration-300 ease-linear"
          style={{ width: `${frac * 100}%` }}
        />
      </div>
    </div>
  );
}
