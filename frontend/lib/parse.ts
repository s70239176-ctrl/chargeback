import type {
  CaseRecord,
  Challenge,
  ChallengeStatus,
  CourtConfig,
  CourtStats,
  Flow,
  Label,
  Snapshot,
  Spend,
  SpendStatus,
} from "./types.ts";

type Rec = Record<string, unknown>;

function rec(value: unknown, what: string): Rec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Unexpected ${what} from the contract`);
  }
  return value as Rec;
}

function str(o: Rec, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new Error(`Contract field ${key} is not text`);
  return v;
}

function num(o: Rec, key: string): number {
  const v = o[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  throw new Error(`Contract field ${key} is not a number`);
}

const SPEND_STATUS: readonly SpendStatus[] = ["open", "challenged", "cleared", "final", "reverted"];
const CHALLENGE_STATUS: readonly ChallengeStatus[] = ["pending", "upheld", "rejected", "appealed"];
const LABELS: readonly Label[] = ["MATCH", "MISMATCH", "INCONCLUSIVE"];

function oneOf<T extends string>(allowed: readonly T[], value: string, what: string): T {
  const hit = allowed.find((a) => a === value);
  if (hit === undefined) throw new Error(`Unknown ${what} "${value}" from the contract`);
  return hit;
}

/** The contract returns JSON text from every view; callers get a value, never a raw string. */
export function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") throw new Error("The contract did not return JSON text");
  return JSON.parse(raw) as unknown;
}

export function toChallenge(value: unknown): Challenge {
  const o = rec(value, "challenge");
  const label = str(o, "verdict_label");
  return {
    id: num(o, "id"),
    spendId: num(o, "spend_id"),
    challenger: str(o, "challenger"),
    bond: num(o, "bond"),
    claim: str(o, "claim"),
    counterUrl: str(o, "counter_url"),
    citedCaseId: num(o, "cited_case_id"),
    status: oneOf(CHALLENGE_STATUS, str(o, "status"), "challenge status"),
    verdictLabel: label === "" ? "" : oneOf(LABELS, label, "label"),
    verdictReason: str(o, "verdict_reason"),
    evidenceQuote: str(o, "evidence_quote"),
    caseId: num(o, "case_id"),
    appealBond: num(o, "appeal_bond"),
    appeals: num(o, "appeals"),
  };
}

function toFlow(value: unknown): Flow {
  const o = rec(value, "ledger row");
  return { to: str(o, "to"), amount: num(o, "amount"), why: str(o, "why") };
}

export function toSpend(value: unknown): Spend {
  const o = rec(value, "spend");
  const settlement = o["settlement"];
  if (!Array.isArray(settlement)) throw new Error("Contract field settlement is not a list");
  const challenge = o["challenge"];
  return {
    id: num(o, "id"),
    payer: str(o, "payer"),
    recipient: str(o, "recipient"),
    amount: num(o, "amount"),
    bond: num(o, "bond"),
    mandate: str(o, "mandate"),
    evidenceUrl: str(o, "evidence_url"),
    trace: str(o, "trace"),
    openedAt: num(o, "opened_at"),
    challengeDeadline: num(o, "challenge_deadline"),
    appealDeadline: num(o, "appeal_deadline"),
    status: oneOf(SPEND_STATUS, str(o, "status"), "spend status"),
    activeChallengeId: num(o, "active_challenge_id"),
    settlement: settlement.map(toFlow),
    challenge: challenge === null || challenge === undefined ? null : toChallenge(challenge),
  };
}

export function toSpendList(value: unknown): Spend[] {
  if (!Array.isArray(value)) throw new Error("Expected a list of spends");
  return value.map(toSpend);
}

export function toCase(value: unknown): CaseRecord {
  const o = rec(value, "case");
  const overturned = o["overturned"];
  return {
    id: num(o, "id"),
    spendId: num(o, "spend_id"),
    challengeId: num(o, "challenge_id"),
    round: num(o, "round"),
    label: oneOf(LABELS, str(o, "label"), "label"),
    reason: str(o, "reason"),
    quote: str(o, "quote"),
    mandateHash: str(o, "mandate_hash"),
    overturned: overturned === true,
  };
}

export function toCaseList(value: unknown): CaseRecord[] {
  if (!Array.isArray(value)) throw new Error("Expected a list of cases");
  return value.map(toCase);
}

export function toConfig(value: unknown): CourtConfig {
  const o = rec(value, "config");
  return {
    tickSeconds: num(o, "tick_seconds"),
    windowTicks: num(o, "window_ticks"),
    windowSeconds: num(o, "window_seconds"),
    minBond: num(o, "min_bond"),
    bondBps: num(o, "bond_bps"),
    minAmount: num(o, "min_amount"),
    seedCap: num(o, "seed_cap"),
  };
}

export function toStats(value: unknown): CourtStats {
  const o = rec(value, "stats");
  return {
    spendCount: num(o, "spend_count"),
    challengeCount: num(o, "challenge_count"),
    caseCount: num(o, "case_count"),
    totalSupply: num(o, "total_supply"),
  };
}

export function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  throw new Error("The contract did not return a number");
}

function numberMap(value: unknown, what: string): Record<string, number> {
  const o = rec(value, what);
  const out: Record<string, number> = {};
  for (const key of Object.keys(o)) out[key.toLowerCase()] = num(o, key);
  return out;
}

export function toSnapshot(value: unknown): Snapshot {
  const o = rec(value, "snapshot");
  return {
    config: toConfig(o["config"]),
    stats: toStats(o["stats"]),
    spends: toSpendList(o["spends"]),
    cases: toCaseList(o["cases"]),
    balances: numberMap(o["balances"], "balances"),
    seeded: numberMap(o["seeded"], "seeded"),
  };
}
