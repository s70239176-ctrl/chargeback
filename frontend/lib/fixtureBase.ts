"use client";

import { useCallback, useEffect, useState } from "react";
import { defaultFixtureBase, isPrivateHost } from "./config.ts";

const KEY = "chargeback.fixture-base.v1";

/**
 * Where the demo evidence pages are served from. The validators fetch these URLs themselves, so
 * the host must be publicly reachable; on localhost the reviewer points this at a tunnel.
 */
export function useFixtureBase() {
  const [base, setBaseState] = useState(defaultFixtureBase);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(KEY);
    } catch {
      /* storage unavailable */
    }
    setBaseState(saved || defaultFixtureBase || window.location.origin);
  }, []);

  const setBase = useCallback((value: string) => {
    const clean = value.trim().replace(/\/+$/, "");
    setBaseState(clean);
    try {
      if (clean) window.localStorage.setItem(KEY, clean);
      else window.localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return { base, setBase, isPrivate: base !== "" && isPrivateHost(base) };
}
