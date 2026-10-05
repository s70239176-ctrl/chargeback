"use client";

import Link from "next/link";
import { formatClock } from "../../lib/clock.ts";
import { type NextAction, type RiskBuckets, type Money, vetoRate } from "../../lib/derive.ts";
import { usd } from "../../lib/money.ts";
import type { CaseRecord, Spend } from "../../lib/types.ts";
import { Badge, LinkButton, Metric, Panel } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import c from "./console.module.css";

/** Potential -> Challenged -> Recovered -> At risk, drawn as one connected story. */
export function RecoverySummary({ money, risk }: { money: Money; risk: RiskBuckets }) {
  const steps = [
    { label: "Under watch", value: money.underWatch, foot: "Still inside a window", tone: undefined },
    { label: "Challenged", value: money.challenged, foot: "Strangers funded a second look", tone: undefined },
    { label: "Recovered", value: money.recovered, foot: "Reverted and returned to payers", tone: "positive" as const },
    { label: "At risk", value: risk.total, foot: "Moves without a second look", tone: risk.total > 0 ? ("danger" as const) : undefined },
  ];
  return (
    <ol className={c.flow} aria-label="Recovery summary">
      {steps.map((s, i) => (
        <li key={s.label} className={c.flowStep}>
          <Metric label={s.label} value={s.value} format={usd} foot={s.foot} tone={s.tone} />
          {i < steps.length - 1 && <span className={c.flowArrow} aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

export function RiskPanel({ risk, top }: { risk: RiskBuckets; top: NextAction | undefined }) {
  const rows = [
    { label: "Closing within one tick", ...risk.closing },
    { label: "Window closed, release pending", ...risk.releasing },
    { label: "Challenge waiting for a ruling", ...risk.awaitingPanel },
    { label: "Ruled, appeal window open", ...risk.appealable },
  ];
  return (
    <Panel title="Money at risk" tone={risk.total > 0 ? "risk" : undefined}>
      <Metric label="Total" value={risk.total} format={usd} size="xl" tone={risk.total > 0 ? "danger" : undefined} foot={risk.total === 0 ? "Nothing is moving unchecked." : undefined} />
      <ul className={c.riskRows}>
        {rows.map((r) => (
          <li key={r.label}>
            <span className={c.riskAmount}>{usd(r.amount)}</span>
            <span className={c.riskLabel}>
              {r.label}
              <span className={c.dim}> · {r.count} {r.count === 1 ? "spend" : "spends"}</span>
            </span>
          </li>
        ))}
      </ul>
      {top ? (
        <LinkButton href={`/console/spend/${top.spendId}`} variant="primary">
          Resolve highest risk <Icon name="arrow" size={16} />
        </LinkButton>
      ) : (
        <p className={c.dim}>When a window is about to close or a ruling is waiting, the highest-risk spend is one click away.</p>
      )}
    </Panel>
  );
}

const PRIORITY_TONE = { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" } as const;

export function NextBestActions({ actions, limit = 4 }: { actions: readonly NextAction[]; limit?: number }) {
  const shown = actions.slice(0, limit);
  return (
    <Panel title="Next best actions">
      <p className={c.dim} style={{ margin: "0 0 16px" }}>Ranked by value, time left and what blocks money.</p>
      {shown.length === 0 ? (
        <p className={c.dim}>Your recovery queue is clear. New spends and challenges will be ranked here.</p>
      ) : (
        <ul className={c.actions}>
          {shown.map((a) => (
            <li key={a.key}>
              <Link href={`/console/spend/${a.spendId}`} className={c.action}>
                <span className={c.actionAmount}>{usd(a.amount)}</span>
                <span className={c.actionBody}>
                  <Badge tone={PRIORITY_TONE[a.priority]}>{a.priority} PRIORITY</Badge>
                  <span className={c.actionTitle}>{a.title}</span>
                  <span className={c.dim}>
                    Spend #{a.spendId} · {a.detail}
                    {a.secondsLeft !== null && ` · ${formatClock(a.secondsLeft)} left`}
                  </span>
                  {a.payout !== null && <span className={c.dim}>If upheld, the challenger collects {usd(a.payout)}</span>}
                </span>
                <span className={c.actionCta}>
                  {a.cta} <Icon name="arrow" size={14} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

interface Insight {
  key: string;
  text: string;
  basis: string;
  href?: string;
  cta?: string;
}

function insightsFor(spends: readonly Spend[], cases: readonly CaseRecord[], risk: RiskBuckets): Insight[] {
  const out: Insight[] = [];
  const rate = vetoRate(spends);
  if (cases.length > 0 && rate !== null) {
    const upheld = cases.filter((x) => x.label === "MISMATCH").length;
    out.push({
      key: "rate",
      text: `The panel has ruled ${cases.length} ${cases.length === 1 ? "time" : "times"}: ${upheld} upheld, ${cases.length - upheld} rejected. ${Math.round(rate * 100)}% of ruled challenges reverted the spend.`,
      basis: `${cases.length} recorded rulings`,
      href: "/console/analysis",
      cta: "Read the rulings",
    });
  }
  const last = cases[0];
  if (last) {
    out.push({
      key: "last",
      text: `Latest ruling, Case #${last.id}: ${last.label}. ${last.reason}`,
      basis: "Validator consensus on the label; the quote was verified on the page",
      href: `/console/spend/${last.spendId}`,
      cta: "Investigate",
    });
  }
  const exposed = risk.closing.count + risk.releasing.count;
  if (exposed > 0) {
    out.push({
      key: "exposed",
      text: `${exposed} ${exposed === 1 ? "spend is" : "spends are"} about to release without a second look, ${usd(risk.closing.amount + risk.releasing.amount)} in total.`,
      basis: "Challenge windows read against chain time",
      href: "/console/opportunities",
      cta: "Review",
    });
  }
  const inconclusive = cases.filter((x) => x.label === "INCONCLUSIVE").length;
  if (inconclusive > 0) {
    out.push({
      key: "inc",
      text: `${inconclusive} ${inconclusive === 1 ? "ruling was" : "rulings were"} inconclusive. When the pages cannot settle a mandate the challenger loses the bond, so vague mandates favour the payer.`,
      basis: "Contract rule: INCONCLUSIVE never reverts funds",
    });
  }
  return out;
}

export function IntelligencePanel({ spends, cases, risk }: { spends: readonly Spend[]; cases: readonly CaseRecord[]; risk: RiskBuckets }) {
  const items = insightsFor(spends, cases, risk);
  return (
    <Panel title={<><Icon name="sparkle" size={12} /> Chargeback intelligence</>} tone="intel">
      {items.length === 0 ? (
        <p className={c.dim}>No insights yet. Once spends are challenged and ruled on, the panel&apos;s findings are summarised here with their sources.</p>
      ) : (
        <ul className={c.insights}>
          {items.map((i) => (
            <li key={i.key}>
              <p className={c.insightText}>{i.text}</p>
              <p className={c.insightBasis}>Basis: {i.basis}</p>
              {i.href && (
                <Link href={i.href} className={c.insightLink}>
                  {i.cta} <Icon name="arrow" size={13} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
