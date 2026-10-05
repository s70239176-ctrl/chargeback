"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalldataEncodable } from "genlayer-js/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ROLES, addressesOf, loadOrCreateKeys, resetKeys, type Keys } from "./accounts.ts";
import { createChainApi, type ChainApi, type Hash, type Signer, type TxPhase } from "./chain.ts";
import { chainConfig } from "./config.ts";
import { describeError } from "./errors.ts";
import type { CaseRecord, CourtConfig, CourtStats, Role, Spend, WriteFn } from "./types.ts";

export interface TxEntry {
  id: number;
  label: string;
  role: Role;
  fn: WriteFn;
  hash?: Hash;
  phase: TxPhase | "failed";
  detail?: string;
  error?: string;
}

export type RunResult = { ok: true; hash: Hash } | { ok: false; error: string };

interface CourtValue {
  api: ChainApi;
  addresses: Record<Role, string>;
  active: Role;
  setActive: (role: Role) => void;
  run: (label: string, role: Role, fn: WriteFn, args: CalldataEncodable[]) => Promise<RunResult>;
  txs: TxEntry[];
  busy: boolean;
  dismissTx: (id: number) => void;
  resetAccounts: () => void;
  /** Chain time in seconds, advanced locally between RPC reads. */
  chainNow: number;
  chainReady: boolean;
  config: CourtConfig | undefined;
  stats: CourtStats | undefined;
  spends: Spend[] | undefined;
  cases: CaseRecord[] | undefined;
  balances: Record<Role, number | undefined>;
  dataError: string | null;
  seeded: boolean;
  seededRoles: Record<Role, boolean>;
  /** True when one of this browser's three demo accounts is a party to the spend. */
  isMine: (spend: Spend) => boolean;
}

const Ctx = createContext<CourtValue | null>(null);

export function useCourt(): CourtValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCourt must be used inside <CourtProvider>");
  return v;
}

export function CourtProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 2000 } } }));
  return (
    <QueryClientProvider client={client}>
      <Inner>{children}</Inner>
    </QueryClientProvider>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<Keys | null>(null);
  useEffect(() => setKeys(loadOrCreateKeys()), []);
  if (!chainConfig) return <>{children}</>;
  if (!keys) return null;
  return <Live keys={keys} onReset={() => setKeys(resetKeys())}>{children}</Live>;
}

/** Seconds on the chain's clock: read once a minute, interpolated locally in between. */
function useChainNow(api: ChainApi) {
  const query = useQuery({
    queryKey: ["chain-time"],
    queryFn: async () => ({ chain: await api.reads.chainTime(), local: Date.now() }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!query.data) return { now: 0, ready: false };
  return { now: query.data.chain + Math.floor((Date.now() - query.data.local) / 1000), ready: true };
}

function Live({ keys, onReset, children }: { keys: Keys; onReset: () => void; children: ReactNode }) {
  const cfg = chainConfig;
  if (!cfg) throw new Error("unreachable: Live is only rendered with a chain config");
  const api = useMemo(() => createChainApi(cfg), [cfg]);
  const addresses = useMemo(() => addressesOf(keys), [keys]);
  const signers = useMemo<Record<Role, Signer>>(
    () => ({
      payer: api.signer(keys.payer),
      recipient: api.signer(keys.recipient),
      stranger: api.signer(keys.stranger),
    }),
    [api, keys],
  );
  const qc = useQueryClient();
  const [active, setActive] = useState<Role>("stranger");
  const [txs, setTxs] = useState<TxEntry[]>([]);
  const nextId = useRef(1);
  const inFlight = useRef(0);
  const [busy, setBusy] = useState(false);

  const { now: chainNow, ready: chainReady } = useChainNow(api);

  // One request returns everything on screen. The hosted RPC allows ~30 requests a minute, so the
  // snapshot is polled slowly and not at all while a transaction is being followed (that already polls).
  const wanted = useMemo(() => ROLES.map((r) => addresses[r]), [addresses]);
  const snapshot = useQuery({
    queryKey: ["snapshot", ...wanted],
    queryFn: () => api.reads.snapshot(wanted),
    refetchInterval: busy ? false : 10_000,
    staleTime: 4000,
    retry: 1,
  });
  const snap = snapshot.data;
  const balanceOf = (role: Role): number | undefined => (snap ? (snap.balances[addresses[role].toLowerCase()] ?? 0) : undefined);
  const balances: Record<Role, number | undefined> = {
    payer: balanceOf("payer"),
    recipient: balanceOf("recipient"),
    stranger: balanceOf("stranger"),
  };

  const patch = useCallback((id: number, change: Partial<TxEntry>) => {
    setTxs((list) => list.map((t) => (t.id === id ? { ...t, ...change } : t)));
  }, []);

  const run = useCallback<CourtValue["run"]>(
    async (label, role, fn, args) => {
      const id = nextId.current++;
      setTxs((list) => [...list.slice(-5), { id, label, role, fn, phase: "signing" }]);
      inFlight.current += 1;
      setBusy(true);
      try {
        const hash = await signers[role].send(fn, args, {
          onHash: (h) => patch(id, { hash: h }),
          onPhase: (phase, detail) => {
            patch(id, { phase, detail });
            // A finished transaction has done its job on screen; failures stay until dismissed.
            if (phase === "accepted") setTimeout(() => setTxs((list) => list.filter((t) => t.id !== id)), 9000);
          },
        });
        inFlight.current -= 1;
        if (inFlight.current === 0) setBusy(false);
        await qc.invalidateQueries({ queryKey: ["snapshot"] });
        return { ok: true, hash };
      } catch (e) {
        const error = describeError(e);
        patch(id, { phase: "failed", error });
        inFlight.current -= 1;
        if (inFlight.current === 0) setBusy(false);
        await qc.invalidateQueries({ queryKey: ["snapshot"] });
        return { ok: false, error };
      }
    },
    [signers, patch, qc],
  );

  const dismissTx = useCallback((id: number) => setTxs((list) => list.filter((t) => t.id !== id)), []);

  const resetAccounts = useCallback(() => {
    setTxs([]);
    onReset();
  }, [onReset]);

  const seededRoles: Record<Role, boolean> = {
    payer: (snap?.seeded[addresses.payer.toLowerCase()] ?? 0) > 0,
    recipient: (snap?.seeded[addresses.recipient.toLowerCase()] ?? 0) > 0,
    stranger: (snap?.seeded[addresses.stranger.toLowerCase()] ?? 0) > 0,
  };
  const mine = new Set(ROLES.map((r) => addresses[r].toLowerCase()));
  const isMine = (s: Spend) =>
    mine.has(s.payer.toLowerCase()) ||
    mine.has(s.recipient.toLowerCase()) ||
    (s.challenge !== null && mine.has(s.challenge.challenger.toLowerCase()));

  const value: CourtValue = {
    api,
    addresses,
    active,
    setActive,
    run,
    txs,
    busy,
    dismissTx,
    resetAccounts,
    chainNow,
    chainReady,
    config: snap?.config,
    stats: snap?.stats,
    spends: snap?.spends,
    cases: snap?.cases,
    balances,
    dataError: snapshot.error ? describeError(snapshot.error) : null,
    seededRoles,
    seeded: ROLES.every((r) => seededRoles[r]),
    isMine,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
