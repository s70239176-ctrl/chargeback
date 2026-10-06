export type SpendStatus = "open" | "challenged" | "cleared" | "final" | "reverted";
export type ChallengeStatus = "pending" | "upheld" | "rejected" | "appealed";
export type Label = "MATCH" | "MISMATCH" | "INCONCLUSIVE";

export interface Flow {
  to: string;
  amount: number;
  why: string;
}

export interface Challenge {
  id: number;
  spendId: number;
  challenger: string;
  bond: number;
  claim: string;
  counterUrl: string;
  citedCaseId: number;
  status: ChallengeStatus;
  verdictLabel: Label | "";
  verdictReason: string;
  evidenceQuote: string;
  caseId: number;
  appealBond: number;
  appeals: number;
}

export interface Spend {
  id: number;
  payer: string;
  recipient: string;
  amount: number;
  bond: number;
  mandate: string;
  evidenceUrl: string;
  trace: string;
  openedAt: number;
  challengeDeadline: number;
  appealDeadline: number;
  status: SpendStatus;
  activeChallengeId: number;
  settlement: Flow[];
  challenge: Challenge | null;
}

export interface CaseRecord {
  id: number;
  spendId: number;
  challengeId: number;
  round: number;
  label: Label;
  reason: string;
  quote: string;
  mandateHash: string;
  overturned: boolean;
}

export interface CourtConfig {
  tickSeconds: number;
  windowTicks: number;
  windowSeconds: number;
  minBond: number;
  bondBps: number;
  minAmount: number;
  seedCap: number;
}

export interface CourtStats {
  spendCount: number;
  challengeCount: number;
  caseCount: number;
  totalSupply: number;
}

export type Role = "payer" | "recipient" | "stranger";
/** A demo account, or the visitor's own connected wallet. */
export type Identity = Role | "wallet";

export type WriteFn =
  | "seed"
  | "open_spend"
  | "challenge"
  | "rule"
  | "appeal"
  | "rule_appeal"
  | "accept_ruling"
  | "finalize";

export interface Snapshot {
  config: CourtConfig;
  stats: CourtStats;
  spends: Spend[];
  cases: CaseRecord[];
  /** Micro-USDC by lower-case address. */
  balances: Record<string, number>;
  /** Amount each address was seeded with, 0 if never. */
  seeded: Record<string, number>;
}
