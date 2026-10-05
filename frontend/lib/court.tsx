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
  at: number;
}

export type RunResult = { ok: true; hash: Hash } | { ok: false; error: string };

interface CourtValue {
  /** False when the build has no contract address; every view then shows its empty state. */
  configured: boolean;
  /** True once this browser's demo keys exist (they are minted client-side after hydration). */
  accountsReady: boolean;
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
  loading: boolean;
  seeded: boolean;
  seededRoles: Record<Role, boolean>;
  /** True when one of this browser's three demo accounts is a party to the spend. */
  isMine: (spend: Spend) => boolean;
}

const BLANK: Record<Role, string> = { payer: "", recipient: "", stranger: "" };

const OFFLINE: CourtValue = {
  configured: false,
  accountsReady: false,
  addresses: BLANK,
  active: "stranger",
  setActive: () => undefined,
  run: async () => ({ ok: false, error: "This build has no contract address (NEXT_PUBLIC_CHARGEBACK_ADDRESS)." }),
  txs: [],
  busy: false,
  dismissTx: () => undefined,
  resetAccounts: () => undefined,
  chainNow: 0,
  chainReady: false,
  config: undefined,
  stats: undefined,
  spends: undefined,
  cases: undefined,
  balances: { payer: undefined, recipient: undefined, stranger: undefined },
  dataError: null,
  loading: false,
  seeded: false,
  seededRoles: { payer: false, recipient: false, stranger: false },
  isMine: () => false,
};

const Ctx = createContext<CourtValue>(OFFLINE);

export function useCourt(): CourtValue {
  return useContext(Ctx);
}

export function CourtProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 2000 } } }));
  return (
    <QueryClientProvider client={client}>
      {chainConfig ? <Live>{children}</Live> : <Ctx.Provider value={OFFLINE}>{children}</Ctx.Provider>}
    </QueryClientProvider>
  );
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

function Live({ children }: { children: ReactNode }) {
  const cfg = chainConfig;
  if (!cfg) throw new Error("unreachable: Live is only rendered with a chain config");
  const api = useMemo(() => createChainApi(cfg), [cfg]);
  const [keys, setKeys] = useState<Keys | null>(null);
  useEffect(() => setKeys(loadOrCreateKeys()), []);
  const addresses = useMemo(() => (keys ? addressesOf(keys) : BLANK), [keys]);
  const signers = useMemo<Record<Role, Signer> | null>(
    () =>
      keys
        ? { payer: api.signer(keys.payer), recipient: api.signer(keys.recipient), stranger: api.signer(keys.stranger) }
        : null,
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
  const wanted = useMemo(() => (keys ? ROLES.map((r) => addresses[r]) : []), [keys, addresses]);
  const snapshot = useQuery({
    queryKey: ["snapshot", ...wanted],
    queryFn: () => api.reads.snapshot(wanted),
    refetchInterval: busy ? false : 10_000,
    staleTime: 4000,
    retry: 1,
  });
  const snap = snapshot.data;
  const balanceOf = (role: Role): number | undefined =>
    snap && keys ? (snap.balances[addresses[role].toLowerCase()] ?? 0) : undefined;
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
      if (!signers) return { ok: false, error: "Demo accounts are still being created. Try again in a moment." };
      const id = nextId.current++;
      setTxs((list) => [...list.slice(-19), { id, label, role, fn, phase: "signing", at: Date.now() }]);
      inFlight.current += 1;
      setBusy(true);
      const settle = () => {
        inFlight.current -= 1;
        if (inFlight.current === 0) setBusy(false);
      };
      try {
        const hash = await signers[role].send(fn, args, {
          onHash: (h) => patch(id, { hash: h }),
          onPhase: (phase, detail) => patch(id, { phase, detail }),
        });
        settle();
        await qc.invalidateQueries({ queryKey: ["snapshot"] });
        return { ok: true, hash };
      } catch (e) {
        const error = describeError(e);
        patch(id, { phase: "failed", error });
        settle();
        await qc.invalidateQueries({ queryKey: ["snapshot"] });
        return { ok: false, error };
      }
    },
    [signers, patch, qc],
  );

  const dismissTx = useCallback((id: number) => setTxs((list) => list.filter((t) => t.id !== id)), []);

  const resetAccounts = useCallback(() => {
    setTxs([]);
    setKeys(resetKeys());
  }, []);

  const seededRoles: Record<Role, boolean> = {
    payer: (snap?.seeded[addresses.payer.toLowerCase()] ?? 0) > 0,
    recipient: (snap?.seeded[addresses.recipient.toLowerCase()] ?? 0) > 0,
    stranger: (snap?.seeded[addresses.stranger.toLowerCase()] ?? 0) > 0,
  };
  const mine = new Set(keys ? ROLES.map((r) => addresses[r].toLowerCase()) : []);
  const isMine = (s: Spend) =>
    mine.has(s.payer.toLowerCase()) ||
    mine.has(s.recipient.toLowerCase()) ||
    (s.challenge !== null && mine.has(s.challenge.challenger.toLowerCase()));

  const value: CourtValue = {
    configured: true,
    accountsReady: keys !== null,
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
    loading: snapshot.isLoading,
    seededRoles,
    seeded: ROLES.every((r) => seededRoles[r]),
    isMine,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
