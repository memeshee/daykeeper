import { formatNear, short, shortKey } from "@/lib/chain";
import type { State } from "@/lib/chain";

const REPO = "https://github.com/PhiBao/daykeeper";

export function KeyBox({ state }: { state: State }) {
  const held = Boolean(state.keeper);
  return (
    <section className="border-t rule pt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="label">the key</h2>
        <span className={`label ${held ? "text-sage" : "text-ink-faint"}`}>
          {held ? "installed" : "not issued"}
        </span>
      </div>

      <p className="display mt-3 text-[clamp(1.35rem,2.4vw,1.9rem)] leading-tight">
        {held ? (
          <>
            {short(state.keeper)} holds one key.
            <br />
            <span className="text-ink-soft italic">It can speak and give. It cannot take.</span>
          </>
        ) : (
          <>
            No keeper today.
            <br />
            <span className="text-ink-soft italic">The seat is empty until the round settles.</span>
          </>
        )}
      </p>

      <ul className="mt-6 space-y-3 text-[13px]">
        <li className="flex gap-3 border-b rule pb-3">
          <span className="mt-[3px] w-4 text-center text-sage" aria-hidden>
            ✓
          </span>
          <span>
            <b className="font-medium">speak as the treasury</b>
            <span className="block text-ink-faint">
              scoped to <code className="text-ink-soft">say</code>, gas paid from the key&apos;s
              allowance — the keeper needs no NEAR. On mainnet the same key shape points at
              near.social&apos;s <code className="text-ink-soft">social</code> account instead.
            </span>
          </span>
        </li>
        <li className="flex gap-3 border-b rule pb-3">
          <span className="mt-[3px] w-4 text-center text-sage" aria-hidden>
            ✓
          </span>
          <span>
            <b className="font-medium">
              send one grant of {formatNear(state.grant_cap_yocto, 4)} NEAR
            </b>
            <span className="block text-ink-faint">
              scoped to <code className="text-ink-soft">grant</code>, one per round, capped by
              parameters fixed at launch
            </span>
          </span>
        </li>
        <li className="flex gap-3 border-b rule pb-3">
          <span className="mt-[3px] w-4 text-center text-signal" aria-hidden>
            ✕
          </span>
          <span>
            <b className="font-medium">transfer anything else</b>
            <span className="block text-ink-faint">
              a function-call key cannot attach NEAR and cannot call any other method — the pool is
              out of its reach
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-[3px] w-4 text-center text-signal" aria-hidden>
            ✕
          </span>
          <span>
            <b className="font-medium">stay past the deadline</b>
            <span className="block text-ink-faint">
              every privileged method re-checks <code className="text-ink-soft">block_timestamp</code>{" "}
              against the round end. Expiry needs no scheduler and no admin.
            </span>
          </span>
        </li>
      </ul>

      <dl className="mt-6 space-y-2 text-[12px]">
        <div className="flex justify-between">
          <dt className="text-ink-faint">grant key</dt>
          <dd className="numeral text-ink-soft">{shortKey(state.grant_key)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-faint">voice key</dt>
          <dd className="numeral text-ink-soft">{shortKey(state.voice_key)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-faint">grants left this round</dt>
          <dd className="numeral text-ink-soft">{state.keeper_grants_left} of 1</dd>
        </div>
      </dl>

      <a
        className="label mt-6 inline-block border-b border-ink pb-1 text-ink hover:text-signal hover:border-signal"
        href={REPO}
        target="_blank"
        rel="noreferrer"
      >
        read the contract →
      </a>
    </section>
  );
}
