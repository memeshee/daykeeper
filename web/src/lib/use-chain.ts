"use client";

import { useEffect, useState } from "react";

import type { Grant, Keeper, State, Voice } from "@/lib/chain";
import { view } from "@/lib/chain";

export function useChain() {
  const [state, setState] = useState<State | null>(null);
  const [keepers, setKeepers] = useState<Keeper[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [s, k, g, v] = await Promise.all([
          view<Record<string, never>, State>("get_state"),
          view<Record<string, never>, Keeper[]>("get_keepers"),
          view<Record<string, never>, Grant[]>("get_grants"),
          view<Record<string, never>, Voice[]>("get_voices"),
        ]);
        if (!alive) return;
        setState(s);
        setKeepers(k ?? []);
        setGrants(g ?? []);
        setVoices(v ?? []);
        setError(null);
        // chain time vs local clock, so the countdown does not lie
        setOffsetMs(Number(s.now_ns) / 1e6 - Date.now());
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const id = setInterval(load, 4000); // the clock ticks locally; only state needs refreshing
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { state, keepers, grants, voices, error, offsetMs };
}
