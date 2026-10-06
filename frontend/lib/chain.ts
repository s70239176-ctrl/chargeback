/**
 * The one GenLayer client file. Everything that talks to the Intelligent Contract goes through
 * here: typed reads, and writes that preflight, sign, follow consensus and surface the contract's
 * own revert string. Nothing in this file (or anywhere in the app) decides a verdict.
 */
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import type { CalldataEncodable, Hash as GenHash } from "genlayer-js/types";
import { RevertError, TxFailure, revertFromReceipt, revertFromRpcError } from "./errors.ts";
import {
  parseJson,
  toSnapshot,
  toCase,
  toCaseList,
  toChallenge,
  toConfig,
  toInt,
  toSpend,
  toSpendList,
  toStats,
} from "./parse.ts";
import type { CaseRecord, Challenge, CourtConfig, CourtStats, Snapshot, Spend, WriteFn } from "./types.ts";

export type Address = `0x${string}`;
export type Hash = GenHash;

export interface ChainConfig {
  rpcUrl: string;
  chainId: number;
  contract: Address;
}

export type TxPhase = "signing" | "pending" | "accepted";

export interface TxHooks {
  onHash?: (hash: Hash) => void;
  /** `detail` is the live consensus stage the network reports (PROPOSING, COMMITTING, ...). */
  onPhase?: (phase: TxPhase, detail?: string) => void;
}

/** These two calls run the validator panel; a dry run would burn a full LLM round. */
const PANEL_CALLS: ReadonlySet<WriteFn> = new Set<WriteFn>(["rule", "rule_appeal"]);
const SETTLED = new Set(["ACCEPTED", "FINALIZED"]);
const DEAD: Readonly<Record<string, string>> = {
  UNDETERMINED:
    "The validators could not agree, so no ruling was recorded and no funds moved. You can run it again.",
  CANCELED: "The transaction was cancelled before it ran. Nothing moved.",
  LEADER_TIMEOUT: "The lead validator timed out, so no ruling was recorded. Nothing moved. Try again.",
  VALIDATORS_TIMEOUT: "The validators timed out, so no ruling was recorded. Nothing moved. Try again.",
};

const POLL_MS = 4000;

/** Reverts that depend on the clock, which a dry run cannot be trusted about. */
const WINDOW_RULE = /window/i;

/** Marks an error that must not be retried, so it can pass through withRetry untouched. */
class NoRetry extends Error {
  readonly inner: unknown;
  constructor(inner: unknown) {
    super("no retry");
    this.inner = inner;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Seconds the hosted RPC asked us to wait (it allows ~30 requests a minute), or null if this is not that. */
export function rateLimitSeconds(error: unknown): number | null {
  const dig = (v: unknown, ...keys: string[]): unknown => {
    let cur = v;
    for (const k of keys) {
      if (typeof cur !== "object" || cur === null) return undefined;
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  };
  const after = dig(error, "cause", "data", "retry_after_seconds");
  if (typeof after === "number") return Math.min(Math.max(after, 1), 75);
  const text = error instanceof Error ? `${error.message} ${String(dig(error, "details") ?? "")}` : "";
  return /rate limit/i.test(text) ? 20 : null;
}

/** The hosted RPC now and then answers with an HTML error page or drops a request; those are retryable. */
export function isTransient(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : "";
  return /DOCTYPE|Unexpected token|fetch failed|Failed to fetch|NetworkError|timed out|HTTP request failed|ECONNRESET|socket hang up|50[0-4]|52\d/i.test(
    text,
  );
}

/** Retry transient failures with backoff, and wait out the RPC's rate limit when it asks us to. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; onWait?: (seconds: number) => void } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 6;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const limited = rateLimitSeconds(e);
      if (i === attempts - 1 || (limited === null && !isTransient(e))) throw e;
      const wait = limited !== null ? limited + 1 : Math.min(0.6 * 2 ** i, 8);
      if (limited !== null) opts.onWait?.(wait);
      await sleep(wait * 1000);
    }
  }
  throw last;
}

function field(obj: unknown, ...keys: string[]): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (k in o) return o[k];
  return undefined;
}

export function createChainApi(cfg: ChainConfig) {
  const base = cfg.chainId === 61127 ? localnet : studionet;
  const chain = { ...base, rpcUrls: { default: { http: [cfg.rpcUrl] } } } as typeof base;
  const reader = createClient({ chain });

  async function view(functionName: string, args: CalldataEncodable[] = []): Promise<unknown> {
    return withRetry(() => reader.readContract({ address: cfg.contract, functionName, args }));
  }

  const reads = {
    /** Everything the UI polls, in a single request (the hosted RPC allows ~30 a minute). */
    snapshot: async (addresses: readonly string[]): Promise<Snapshot> =>
      toSnapshot(parseJson(await view("get_snapshot", [addresses.join(",")]))),
    config: async (): Promise<CourtConfig> => toConfig(parseJson(await view("get_config"))),
    stats: async (): Promise<CourtStats> => toStats(parseJson(await view("get_stats"))),
    balance: async (address: string): Promise<number> => toInt(await view("get_balance", [address])),
    spends: async (): Promise<Spend[]> => toSpendList(parseJson(await view("list_spends"))),
    spend: async (id: number): Promise<Spend> => toSpend(parseJson(await view("get_spend", [BigInt(id)]))),
    challenge: async (id: number): Promise<Challenge> =>
      toChallenge(parseJson(await view("get_challenge", [BigInt(id)]))),
    cases: async (): Promise<CaseRecord[]> => toCaseList(parseJson(await view("list_cases"))),
    case: async (id: number): Promise<CaseRecord> => toCase(parseJson(await view("get_case", [BigInt(id)]))),
    /** Seconds since the epoch according to the chain, which is what the contract's windows use. */
    chainTime: async (): Promise<number> => {
      const block = await withRetry(() =>
        reader.request({ method: "eth_getBlockByNumber", params: ["latest", false] } as never),
      );
      const ts = field(block, "timestamp");
      if (typeof ts !== "string") throw new Error("The RPC returned no block timestamp");
      return Number.parseInt(ts, 16);
    },
  };

  function signer(privateKey: string) {
    const account = createAccount(privateKey as `0x${string}`);
    return signerFor(createClient({ chain, account }), account.address as Address);
  }

  /**
   * A signer backed by the visitor's own wallet (any EIP-1193 provider). Signing and sending go to the
   * wallet; every read still goes straight to the GenLayer RPC.
   */
  function walletSigner(provider: unknown, address: string) {
    const client = createClient({ chain, account: address as `0x${string}`, provider: provider as never });
    return signerFor(client, address as Address);
  }

  function signerFor(client: ReturnType<typeof createClient>, address: Address) {

    async function send(fn: WriteFn, args: CalldataEncodable[], hooks: TxHooks = {}): Promise<Hash> {
      const waiting = (seconds: number) =>
        hooks.onPhase?.("pending", `rate-limited by the RPC, retrying in ${Math.ceil(seconds)}s`);
      hooks.onPhase?.("signing");
      if (!PANEL_CALLS.has(fn)) {
        try {
          await withRetry(() => client.simulateWriteContract({ address: cfg.contract, functionName: fn, args }), {
            onWait: waiting,
          });
        } catch (e) {
          const reason = revertFromRpcError(e);
          // A dry run does not see the chain's current time, so a verdict about a window can be stale:
          // let the real transaction decide those.
          if (reason && !WINDOW_RULE.test(reason)) throw new RevertError(reason);
          if (!reason) throw e;
        }
      }
      // A rate-limited submit never reached the network, so retrying it cannot double-send.
      const hash = (await withRetry(
        async () => {
          try {
            return await client.writeContract({ address: cfg.contract, functionName: fn, args, value: 0n });
          } catch (e) {
            if (rateLimitSeconds(e) === null) throw new NoRetry(e);
            throw e;
          }
        },
        { onWait: waiting },
      ).catch((e: unknown) => {
        throw e instanceof NoRetry ? e.inner : e;
      })) as Hash;
      hooks.onHash?.(hash);
      hooks.onPhase?.("pending");

      let transient = 0;
      for (let i = 0; i < 360; i++) {
        await sleep(i === 0 ? 3000 : POLL_MS);
        let tx: unknown;
        try {
          // One request per poll: the raw transaction already carries status and the leader receipts.
          tx = await client.request({ method: "eth_getTransactionByHash", params: [hash] } as never);
          transient = 0;
        } catch (e) {
          const limited = rateLimitSeconds(e);
          if (limited !== null) {
            waiting(limited + 1);
            await sleep((limited + 1) * 1000);
            continue;
          }
          if (++transient > 20) throw e;
          continue;
        }
        const status = String(field(tx, "status", "status_name", "statusName") ?? "");
        if (SETTLED.has(status)) {
          const reason = revertFromReceipt(tx);
          if (reason) throw new RevertError(reason);
          hooks.onPhase?.("accepted", status);
          return hash;
        }
        const dead = DEAD[status];
        if (dead) throw new TxFailure(dead);
        hooks.onPhase?.("pending", status || undefined);
      }
      throw new TxFailure("The network is still working on this transaction. Check the explorer for its final state.");
    }

    return { address, send };
  }

  return { config: cfg, reads, signer, walletSigner };
}

export type ChainApi = ReturnType<typeof createChainApi>;
export type Signer = ReturnType<ChainApi["signer"]>;

export function freshPrivateKey(): `0x${string}` {
  return generatePrivateKey();
}

export function addressOf(privateKey: string): Address {
  return createAccount(privateKey as `0x${string}`).address as Address;
}
