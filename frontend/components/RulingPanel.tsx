"use client";

import { useState } from "react";
import { ROLE_LABEL } from "../lib/accounts.ts";
import { activeDeadline, countdown, formatClock } from "../lib/clock.ts";
import { useCourt } from "../lib/court.tsx";
import { formatUsdc } from "../lib/money.ts";
import type { CaseRecord, Challenge, Flow, Label, Spend } from "../lib/types.ts";
import { Busy, TxLink, WhoName } from "./ui.tsx";
import styles from "./Panels.module.css";

const MEANING: Record<Label, { title: string; body: string }> = {
  MISMATCH: { title: "Challenge upheld", body: "The spend is reverted. The challenger collects both bonds." },
  MATCH: { title: "Challenge rejected", body: "The evidence affirms the mandate. The challenger's bond is slashed." },
  INCONCLUSIVE: {
    title: "Challenge rejected, unproven",
    body: "The pages did not settle it. A challenger who cannot prove a contradiction loses the bond; funds never revert on doubt.",
  },
};

export function RulingPanel({ spend }: { spend: Spend | undefined }) {
  const { cases } = useCourt();
  return (
    <section className={styles.panel} aria-labelledby="col3">
      <h2 id="col3" className={styles.heading}>
        <span className={styles.step}>3</span> Ruling
      </h2>
      {spend === undefined ? (
        <div className={styles.emptyBox}>
          <p className={styles.emptyTitle}>No ruling yet.</p>
          <p className={styles.hint}>
            Open a spend, switch to Stranger and fund a second look, then convene the panel. The verdict, its reason and
            the money that moved all appear here.
          </p>
        </div>
      ) : (
        <Ruling spend={spend} />
      )}

      <h3 className={styles.subheading}>Docket</h3>
      {cases === undefined || cases.length === 0 ? (
        <p className={styles.hint}>
          Every ruling becomes a numbered case that a later challenger can cite. None yet.
        </p>
      ) : (
        <ol className={styles.docket}>
          {cases.map((c) => (
            <DocketRow key={c.id} c={c} />
          ))}
        </ol>
      )}
    </section>
  );
}

function DocketRow({ c }: { c: CaseRecord }) {
  return (
    <li className={styles.docketRow}>
      <span className="mono">Case #{c.id}</span>
      <span className="chip">{c.label}</span>
      <span className={styles.hint}>
        spend #{c.spendId} · round {c.round}
        {c.overturned ? " · overturned on appeal" : ""}
      </span>
      <p className="serif">{c.reason}</p>
    </li>
  );
}

function Ruling({ spend }: { spend: Spend }) {
  const { run, active, addresses, busy, txs, chainNow, config } = useCourt();
  const [error, setError] = useState<string | null>(null);
  const ch = spend.challenge;

  if (ch === null) {
    return (
      <div className={styles.emptyBox}>
        <p className={styles.emptyTitle}>Spend #{spend.id} has not been challenged.</p>
        <p className={styles.hint}>
          {spend.status === "open"
            ? "Nobody has funded a second look. Switch to Stranger in column 2 and challenge it before the window closes."
            : "It settled without a ruling."}
        </p>
      </div>
    );
  }

  const live = txs.find(
    (t) => (t.fn === "rule" || t.fn === "rule_appeal") && t.phase !== "failed" && t.phase !== "accepted",
  );
  const iAmChallenger = ch.challenger.toLowerCase() === addresses[active].toLowerCase();
  const deadline = activeDeadline(spend);
  const left = deadline !== null && config ? countdown(deadline, chainNow, config.tickSeconds) : null;
  const canAppeal = ch.status === "rejected" && spend.status === "cleared" && ch.appeals === 0 && left?.closed === false;

  async function act(label: string, fn: "rule" | "rule_appeal" | "appeal" | "accept_ruling") {
    setError(null);
    const res = await run(label, active, fn, [BigInt(ch!.id)]);
    if (!res.ok) setError(res.error);
  }

  if (ch.status === "pending" || ch.status === "appealed") {
    const appeal = ch.status === "appealed";
    return (
      <div className={styles.ruling}>
        <p className={styles.kicker}>
          Spend #{spend.id} · challenge #{ch.id}
          {appeal ? " · appeal" : ""}
        </p>
        <Challenger ch={ch} spend={spend} />
        {live ? (
          <div className={styles.panelBusy} aria-live="polite">
            {live.hash ? <Busy label="The validator panel is reading the pages" /> : <span>Signing…</span>}
            <p className={styles.hint}>
              Each validator fetches the evidence itself and rules independently; consensus must agree on the label.
              {live.detail ? ` Network stage: ${live.detail}.` : ""}
              {live.hash ? (
                <>
                  {" "}
                  Transaction <TxLink hash={live.hash} />
                </>
              ) : null}
            </p>
          </div>
        ) : (
          <div className={styles.actionRow}>
            <p className={styles.hint}>
              The label comes only from validator consensus. This call takes no verdict argument, and anyone may make it.
            </p>
            <button
              type="button"
              className="btn btnStrong"
              disabled={busy}
              onClick={() => act(appeal ? "Run the appeal panel" : "Convene the panel", appeal ? "rule_appeal" : "rule")}
            >
              {appeal ? "Run the appeal panel" : "Convene the panel"}
            </button>
          </div>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const label = ch.verdictLabel === "" ? null : ch.verdictLabel;
  return (
    <div className={styles.ruling}>
      <p className={styles.kicker}>
        Spend #{spend.id} · challenge #{ch.id} · case #{ch.caseId}
        {ch.appeals === 1 ? " · after appeal" : ""}
      </p>
      {label && (
        <>
          <p className={`serif ${styles.verdict} ${label === "MISMATCH" ? styles.verdictMoney : ""}`}>{label}</p>
          <p className={styles.verdictTitle}>{MEANING[label].title}</p>
          <p className={styles.hint}>{MEANING[label].body}</p>
        </>
      )}
      <blockquote className={`serif ${styles.reason}`}>{ch.verdictReason}</blockquote>
      {ch.evidenceQuote && (
        <p className={styles.quote}>
          <span className="label">What the panel quoted</span>
          <span className="mono">“{ch.evidenceQuote}”</span>
        </p>
      )}
      <Challenger ch={ch} spend={spend} />
      <Ledger spend={spend} ch={ch} />

      {canAppeal && (
        <div className={styles.actionRow}>
          {iAmChallenger ? (
            <>
              <p className={styles.hint}>
                You can appeal once for a second bond of {formatUsdc(ch.bond)}
                {left ? ` (${formatClock(left.secondsLeft)} left)` : ""}, or accept now to settle immediately.
              </p>
              <div className={styles.twoBtn}>
                <button type="button" className="btn" disabled={busy} onClick={() => act("Appeal ruling", "appeal")}>
                  Appeal · post {formatUsdc(ch.bond)}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => act("Accept ruling", "accept_ruling")}>
                  Accept ruling
                </button>
              </div>
            </>
          ) : (
            <p className={styles.hint}>
              Only the losing challenger can appeal: switch to{" "}
              <strong>
                <WhoName addresses={addresses} address={ch.challenger} />
              </strong>{" "}
              (currently acting as {ROLE_LABEL[active]}).
            </p>
          )}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Challenger({ ch, spend }: { ch: Challenge; spend: Spend }) {
  const { addresses } = useCourt();
  return (
    <p className={styles.claim}>
      <span className="label">
        Claim by <WhoName addresses={addresses} address={ch.challenger} />
      </span>
      <span className="serif">“{ch.claim}”</span>
      <span className={styles.hint}>
        Mandate: <span className="serif">{spend.mandate}</span>
      </span>
    </p>
  );
}

function Ledger({ spend, ch }: { spend: Spend; ch: Challenge }) {
  const { addresses } = useCourt();
  const settled = spend.settlement.length > 0;
  const held: Flow[] = [
    { to: spend.payer, amount: spend.amount + spend.bond, why: "payer's amount and bond, held" },
    { to: ch.challenger, amount: ch.bond + ch.appealBond, why: "challenger's bond, held" },
  ];
  const rows = settled ? spend.settlement : held;
  return (
    <div className={styles.ledger}>
      <span className="label">{settled ? "Who got what" : "Held until the appeal window closes"}</span>
      <table>
        <tbody>
          {rows.map((f, i) => (
            <tr key={`${f.to}-${i}`}>
              <td>
                <WhoName addresses={addresses} address={f.to} />
              </td>
              <td className={`mono ${settled ? styles.moneyIn : ""}`}>
                {settled ? "+" : ""}
                {formatUsdc(f.amount)}
              </td>
              <td className={styles.why}>{f.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
