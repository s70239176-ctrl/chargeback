/**
 * Everything the console shows is derived here from the contract's own state. Nothing is invented:
 * if a number cannot be computed from a spend, a challenge or a case, it is not shown.
 */
import type { CaseRecord, Role, Spend } from "./types.ts";

export const UNSETTLED = new Set(["open", "challenged", "cleared"]);

export interface Money {
  /** Watched: provisional, challenged or cleared-but-appealable. Could still be vetoed. */
  underWatch: number;
  /** Challenged at least once, any outcome. */
  challenged: number;
  /** Vetoed: the spend was reverted and the funds went back to the payer. */
  recovered: number;
  /** Released to a recipient. */
  released: number;
}

export function summarize(spends: readonly Spend[]): Money {
  const m: Money = { underWatch: 0, challenged: 0, recovered: 0, released: 0 };
  for (const s of spends) {
    if (UNSETTLED.has(s.status)) m.underWatch += s.amount;
    if (s.challenge !== null) m.challenged += s.amount;
    if (s.status === "reverted") m.recovered += s.amount;
    if (s.status === "final") m.released += s.amount;
  }
  return m;
}

export interface RiskBuckets {
  total: number;
  closing: Bucket;
  awaitingPanel: Bucket;
  appealable: Bucket;
  releasing: Bucket;
}
interface Bucket {
  amount: number;
  count: number;
}

/**
 * Money that will move without a second look unless someone acts. `closing` = window ends within
 * one tick; `releasing` = window already closed, payment waiting for anyone to finalize.
 */
export function riskBuckets(spends: readonly Spend[], now: number, tick: number): RiskBuckets {
  const b: RiskBuckets = {
    total: 0,
    closing: { amount: 0, count: 0 },
    awaitingPanel: { amount: 0, count: 0 },
    appealable: { amount: 0, count: 0 },
    releasing: { amount: 0, count: 0 },
  };
  const add = (bucket: Bucket, s: Spend) => {
    bucket.amount += s.amount;
    bucket.count += 1;
    b.total += s.amount;
  };
  for (const s of spends) {
    if (s.status === "open") {
      if (now >= s.challengeDeadline) add(b.releasing, s);
      else if (s.challengeDeadline - now <= tick) add(b.closing, s);
    } else if (s.status === "challenged") add(b.awaitingPanel, s);
    else if (s.status === "cleared") add(b.appealable, s);
  }
  return b;
}

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface NextAction {
  key: string;
  spendId: number;
  priority: Priority;
  title: string;
  detail: string;
  cta: string;
  amount: number;
  /** What the person acting would collect if it goes their way, when that is knowable. */
  payout: number | null;
  secondsLeft: number | null;
  score: number;
}

/**
 * Ranks what to do next across all spends: value at stake, how little time is left, and whether a
 * step is blocking money from moving. Rule-based and explainable; no probabilities are invented.
 */
export function nextActions(
  spends: readonly Spend[],
  me: Readonly<Record<Role, string>>,
  now: number,
  tick: number,
): NextAction[] {
  const mine = new Set(Object.values(me).map((a) => a.toLowerCase()));
  const out: NextAction[] = [];
  for (const s of spends) {
    const parties = mine.has(s.payer.toLowerCase()) || mine.has(s.recipient.toLowerCase());
    if (s.status === "open") {
      const left = s.challengeDeadline - now;
      if (left > 0) {
        if (parties) continue; // a party cannot challenge their own spend
        const urgent = left <= tick;
        out.push({
          key: `challenge-${s.id}`,
          spendId: s.id,
          priority: urgent ? "HIGH" : s.amount >= 100_000_000 ? "MEDIUM" : "LOW",
          title: "Review before the window closes",
          detail: urgent ? "Closes within one tick" : "Challenge window is open",
          cta: "Review",
          amount: s.amount,
          payout: s.bond * 2,
          secondsLeft: left,
          score: s.amount / 1e6 + (urgent ? 1000 : 0) - left / 60,
        });
      } else {
        out.push({
          key: `finalize-${s.id}`,
          spendId: s.id,
          priority: "MEDIUM",
          title: "Window closed, release pending",
          detail: "Anyone can finalize the payment",
          cta: "Finalize",
          amount: s.amount,
          payout: null,
          secondsLeft: null,
          score: 400 + s.amount / 1e6,
        });
      }
    } else if (s.status === "challenged" && s.challenge) {
      out.push({
        key: `panel-${s.id}`,
        spendId: s.id,
        priority: "HIGH",
        title: s.challenge.status === "appealed" ? "Appeal waiting for the panel" : "Challenge waiting for the panel",
        detail: "Funds stay locked until validators rule",
        cta: "Convene panel",
        amount: s.amount,
        payout: null,
        secondsLeft: null,
        score: 900 + s.amount / 1e6,
      });
    } else if (s.status === "cleared") {
      const left = s.appealDeadline - now;
      out.push({
        key: `settle-${s.id}`,
        spendId: s.id,
        priority: left > 0 ? "MEDIUM" : "LOW",
        title: left > 0 ? "Challenge failed, appeal window open" : "Appeal window closed, release pending",
        detail: left > 0 ? "The challenger may appeal once" : "Anyone can finalize the payment",
        cta: left > 0 ? "Open" : "Finalize",
        amount: s.amount,
        payout: null,
        secondsLeft: left > 0 ? left : null,
        score: 300 + s.amount / 1e6,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export type Severity = "high" | "medium" | "info";

export interface Signal {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  spendId?: number;
}

/** Deterministic checks over contract state. These are rules, not predictions. */
export function riskSignals(spends: readonly Spend[], cases: readonly CaseRecord[], now: number, tick: number): Signal[] {
  const out: Signal[] = [];
  const hosts = new Map<string, number>();
  const reverted = new Map<string, number>();
  for (const s of spends) {
    if (s.status === "open" && now >= s.challengeDeadline) {
      out.push({
        key: `rel-${s.id}`,
        severity: "high",
        title: `Spend #${s.id} is releasing unchallenged`,
        detail: "The window closed with no second look. The payment is waiting for anyone to finalize it.",
        spendId: s.id,
      });
    } else if (s.status === "open" && s.challengeDeadline - now <= tick) {
      out.push({
        key: `cls-${s.id}`,
        severity: "medium",
        title: `Spend #${s.id} closes within one tick`,
        detail: "Last chance for a stranger to fund a second look.",
        spendId: s.id,
      });
    }
    if (s.status === "challenged" && s.challenge?.status === "pending") {
      out.push({
        key: `pnl-${s.id}`,
        severity: "medium",
        title: `Spend #${s.id} is waiting for a ruling`,
        detail: "A challenge is funded but the panel has not been convened.",
        spendId: s.id,
      });
    }
    try {
      const host = new URL(s.evidenceUrl).hostname;
      hosts.set(host, (hosts.get(host) ?? 0) + 1);
    } catch {
      /* malformed URLs are rejected on-chain, nothing to count */
    }
    if (s.status === "reverted") reverted.set(s.payer, (reverted.get(s.payer) ?? 0) + 1);
  }
  for (const [payer, n] of reverted) {
    if (n >= 2) {
      out.push({
        key: `pay-${payer}`,
        severity: "info",
        title: `Payer ${payer.slice(0, 6)}…${payer.slice(-4)} has ${n} reverted spends`,
        detail: "The panel has overturned this payer's agent more than once.",
      });
    }
  }
  for (const [host, n] of hosts) {
    if (n >= 3) {
      out.push({
        key: `host-${host}`,
        severity: "info",
        title: `${n} spends cite evidence on ${host}`,
        detail: "One site is the single point of failure for all of them. If it goes down, each reads as a MISMATCH.",
      });
    }
  }
  const inconclusive = cases.filter((c) => c.label === "INCONCLUSIVE").length;
  if (cases.length >= 3 && inconclusive / cases.length >= 0.3) {
    out.push({
      key: "inc",
      severity: "info",
      title: `${inconclusive} of ${cases.length} rulings were inconclusive`,
      detail: "Mandates may be too vague for the cited pages to settle.",
    });
  }
  const rank: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export interface RadarNode {
  id: number;
  amount: number;
  status: Spend["status"];
  /** 0 = at the centre (about to close), 1 = the outer ring (a fresh window). */
  freshness: number;
  angle: number;
  label: string;
}

/** Position spends on the radar: closer to the middle = closer to a decision; bigger = more money. */
export function radarNodes(spends: readonly Spend[], now: number, windowSeconds: number): RadarNode[] {
  const live = spends.filter((s) => UNSETTLED.has(s.status));
  const recent = spends.filter((s) => !UNSETTLED.has(s.status)).slice(0, Math.max(0, 14 - live.length));
  return [...live, ...recent].map((s, i, all) => {
    let freshness = 1;
    if (s.status === "open") freshness = Math.min(1, Math.max(0, (s.challengeDeadline - now) / windowSeconds));
    else if (s.status === "cleared") freshness = Math.min(1, Math.max(0, (s.appealDeadline - now) / windowSeconds)) * 0.8;
    else if (s.status === "challenged") freshness = 0.35;
    else freshness = 0.95;
    return {
      id: s.id,
      amount: s.amount,
      status: s.status,
      freshness,
      angle: (i / Math.max(1, all.length)) * Math.PI * 2 + 0.6,
      label: `#${s.id}`,
    };
  });
}

export interface Point {
  label: string;
  value: number;
}

/** Count of spends opened per bucket of chain time, oldest first. */
export function opened(spends: readonly Spend[], buckets = 8): Point[] {
  if (spends.length === 0) return [];
  const times = spends.map((s) => s.openedAt);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 1);
  const width = Math.ceil(span / buckets) || 1;
  const pts: Point[] = Array.from({ length: buckets }, (_, i) => ({
    label: new Date((min + i * width) * 1000).toISOString().slice(11, 16),
    value: 0,
  }));
  for (const s of spends) {
    const i = Math.min(buckets - 1, Math.floor((s.openedAt - min) / width));
    pts[i]!.value += 1;
  }
  return pts;
}

export interface Tally {
  label: string;
  value: number;
}

export function outcomeTally(spends: readonly Spend[]): Tally[] {
  const order: Array<[string, (s: Spend) => boolean]> = [
    ["Vetoed", (s) => s.status === "reverted"],
    ["Released after a challenge", (s) => s.status === "final" && s.challenge !== null],
    ["Released unchallenged", (s) => s.status === "final" && s.challenge === null],
    ["Still open", (s) => UNSETTLED.has(s.status)],
  ];
  return order.map(([label, test]) => ({ label, value: spends.filter(test).length }));
}

export function labelTally(cases: readonly CaseRecord[]): Tally[] {
  return (["MISMATCH", "MATCH", "INCONCLUSIVE"] as const).map((label) => ({
    label,
    value: cases.filter((c) => c.label === label).length,
  }));
}

/** Money by outcome, in micro-USDC. */
export function moneyByOutcome(spends: readonly Spend[]): Tally[] {
  const m = summarize(spends);
  return [
    { label: "Vetoed", value: m.recovered },
    { label: "Released", value: m.released },
    { label: "Under watch", value: m.underWatch },
  ];
}

/** Share of ruled challenges that the panel upheld, or null before any ruling. */
export function vetoRate(spends: readonly Spend[]): number | null {
  const ruled = spends.filter((s) => s.challenge !== null && s.challenge.verdictLabel !== "");
  if (ruled.length === 0) return null;
  return ruled.filter((s) => s.status === "reverted").length / ruled.length;
}

export function toCsv(rows: ReadonlyArray<Record<string, string | number>>): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]!);
  const esc = (v: string | number) => {
    const t = String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c] ?? "")).join(","))].join("\n");
}

export interface SearchItem {
  kind: string;
  label: string;
  hint: string;
  href?: string;
  action?: string;
}

/** Subsequence fuzzy score; higher is better, -1 is no match. */
export function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  if (q === "") return 0;
  const at = t.indexOf(query.toLowerCase().trim());
  if (at >= 0) return 100 - at;
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak;
    ti = found + 1;
  }
  return score;
}

export function search(items: readonly SearchItem[], query: string, limit = 8): SearchItem[] {
  if (query.trim() === "") return items.slice(0, limit);
  return items
    .map((item) => ({ item, score: Math.max(fuzzy(query, item.label), fuzzy(query, `${item.label} ${item.hint}`) - 5) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}

/** New spends in the last 24h of chain time against the 24h before it. */
export function trend(spends: readonly Spend[], now: number): { text: string; good: boolean } | null {
  const day = 86_400;
  const recent = spends.filter((s) => s.openedAt > now - day).length;
  const prior = spends.filter((s) => s.openedAt <= now - day && s.openedAt > now - 2 * day).length;
  if (recent === 0 && prior === 0) return null;
  if (prior === 0) return { text: `↑ ${recent} new in 24h`, good: true };
  const pct = Math.round(((recent - prior) / prior) * 100);
  return { text: `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs previous 24h`, good: pct >= 0 };
}

/** Per evidence host: how many spends cite it and how many of those were vetoed. */
export function hostTally(spends: readonly Spend[]): Array<{ host: string; spends: number; reverted: number }> {
  const m = new Map<string, { spends: number; reverted: number }>();
  for (const s of spends) {
    let host = "";
    try {
      host = new URL(s.evidenceUrl).hostname;
    } catch {
      continue;
    }
    const e = m.get(host) ?? { spends: 0, reverted: 0 };
    e.spends += 1;
    if (s.status === "reverted") e.reverted += 1;
    m.set(host, e);
  }
  return [...m].map(([host, v]) => ({ host, ...v })).sort((a, b) => b.reverted - a.reverted || b.spends - a.spends);
}
