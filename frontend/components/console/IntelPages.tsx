"use client";

import Link from "next/link";
import { useState } from "react";
import { useCourt } from "../../lib/court.tsx";
import { riskSignals, vetoRate } from "../../lib/derive.ts";
import { shortAddr } from "../../lib/money.ts";
import { Badge, EmptyState, FilterChips, Panel, Skeleton, type Tone } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import { PageHeader } from "./PageHeader.tsx";
import c from "./console.module.css";

const LABEL_TONE: Record<string, Tone> = { MISMATCH: "positive", MATCH: "neutral", INCONCLUSIVE: "warning" };

/** AI Analysis: every ruling the panel has made, with the reason and the quote it relied on. */
export function AnalysisPage() {
  const { cases, spends, loading } = useCourt();
  const [filter, setFilter] = useState<"ALL" | "MISMATCH" | "MATCH" | "INCONCLUSIVE">("ALL");
  const rate = spends ? vetoRate(spends) : null;
  const list = (cases ?? []).filter((x) => filter === "ALL" || x.label === filter);
  return (
    <>
      <PageHeader
        title="AI Analysis"
        sub={
          <>
            Every ruling the validator panel has made. Each is a numbered case that later challengers can cite.
            {rate !== null && <> {Math.round(rate * 100)}% of ruled challenges reverted the spend.</>}
          </>
        }
      />
      <FilterChips
        label="Ruling"
        value={filter}
        onChange={setFilter}
        options={[
          { id: "ALL", label: "All", count: cases?.length ?? 0 },
          { id: "MISMATCH", label: "Upheld", count: cases?.filter((x) => x.label === "MISMATCH").length ?? 0 },
          { id: "MATCH", label: "Rejected", count: cases?.filter((x) => x.label === "MATCH").length ?? 0 },
          { id: "INCONCLUSIVE", label: "Inconclusive", count: cases?.filter((x) => x.label === "INCONCLUSIVE").length ?? 0 },
        ]}
      />
      <div className={c.stackGap}>
        {loading || cases === undefined ? (
          <Skeleton h={120} />
        ) : list.length === 0 ? (
          <EmptyState title="No rulings yet." body="When a challenge is funded and the panel is convened, its ruling is recorded here as a numbered case." />
        ) : (
          list.map((x) => (
            <Panel key={x.id} tone="intel">
              <div className={c.caseHead}>
                <span className="mono">Case #{x.id}</span>
                <Badge tone={LABEL_TONE[x.label] ?? "neutral"}>{x.label}</Badge>
                <span className={c.dim}>spend #{x.spendId} · round {x.round}{x.overturned ? " · overturned on appeal" : ""}</span>
              </div>
              <blockquote className={c.reason}>{x.reason}</blockquote>
              {x.quote && <p className={c.quoteLine}><span className={c.kicker}>Quoted from the page</span> <span className="mono">“{x.quote}”</span></p>}
              <div className={c.caseFoot}>
                <span className={c.faint}>mandate hash <span className="mono">{x.mandateHash.slice(0, 12)}…</span></span>
                <Link href={`/console/spend/${x.spendId}`} className={c.insightLink}>
                  Investigate <Icon name="arrow" size={13} />
                </Link>
              </div>
            </Panel>
          ))
        )}
      </div>
    </>
  );
}

const SEV_TONE = { high: "danger", medium: "warning", info: "info" } as const;

/** Risk Signals: deterministic rules over contract state. They are checks, not predictions. */
export function SignalsPage() {
  const { spends, cases, chainNow, config, loading } = useCourt();
  const signals = spends && config ? riskSignals(spends, cases ?? [], chainNow, config.tickSeconds) : [];
  return (
    <>
      <PageHeader title="Risk Signals" sub="Rule-based checks over the contract's own state. Each one says exactly what it saw; none is a prediction." />
      {loading || spends === undefined ? (
        <Skeleton h={120} />
      ) : signals.length === 0 ? (
        <EmptyState title="No signals." body="Nothing is closing, stuck or concentrated right now. Signals appear when a window is about to close, a ruling is stuck, or evidence depends on a single site." />
      ) : (
        <ul className={c.signals}>
          {signals.map((s) => (
            <li key={s.key}>
              <Panel>
                <div className={c.caseHead}>
                  <Badge tone={SEV_TONE[s.severity]}>{s.severity.toUpperCase()}</Badge>
                  <strong>{s.title}</strong>
                </div>
                <p className={c.dim}>{s.detail}</p>
                {s.spendId !== undefined && (
                  <Link href={`/console/spend/${s.spendId}`} className={c.insightLink}>
                    Open spend #{s.spendId} <Icon name="arrow" size={13} />
                  </Link>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Evidence: every page cited, with what was quoted from it and how it fared. */
export function EvidencePage() {
  const { spends, loading } = useCourt();
  const rows = (spends ?? []).map((s) => ({ s, url: s.evidenceUrl }));
  return (
    <>
      <PageHeader title="Evidence" sub="Every page a spend cites, and what the panel quoted from it. Validators fetch these pages themselves; nothing here is a screenshot." />
      {loading || spends === undefined ? (
        <Skeleton h={120} />
      ) : rows.length === 0 ? (
        <EmptyState title="No evidence on record." body="Evidence is the page a spend cites. It appears here as soon as a spend is opened." />
      ) : (
        <Panel flush>
          <ul className={c.evList}>
            {rows.map(({ s, url }) => (
              <li key={s.id} className={c.evRow}>
                <div>
                  <p className="mono" style={{ margin: 0, overflowWrap: "anywhere" }}>
                    <a href={url} target="_blank" rel="noreferrer">{url}</a>
                  </p>
                  <p className={c.dim} style={{ margin: "4px 0 0" }}>
                    Spend #{s.id} · cited by {shortAddr(s.payer)}
                    {s.challenge?.evidenceQuote ? <> · quoted: <span className="mono">“{s.challenge.evidenceQuote.slice(0, 120)}{s.challenge.evidenceQuote.length > 120 ? "…" : ""}”</span></> : ""}
                  </p>
                </div>
                <Badge tone={s.challenge?.verdictLabel === "MISMATCH" ? "positive" : "neutral"}>{s.challenge?.verdictLabel || "not ruled"}</Badge>
                <Link href={`/console/spend/${s.id}`} className={c.rowLink}>
                  Open <Icon name="arrow" size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
