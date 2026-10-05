"use client";

import { useState } from "react";
import { SCENARIOS, SCENARIO_ORDER } from "../demo/script.ts";
import { ROLES, ROLE_LABEL } from "../lib/accounts.ts";
import { activeDeadline, countdown, formatClock } from "../lib/clock.ts";
import { useCourt } from "../lib/court.tsx";
import { formatUsdc } from "../lib/money.ts";
import type { Spend } from "../lib/types.ts";
import { StatusChip, WhoName } from "./ui.tsx";
import styles from "./Panels.module.css";

export function SpendsPanel({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const { spends, active, setActive, addresses, dataError, isMine } = useCourt();
  const [showAll, setShowAll] = useState(false);
  const mineOnly = (spends ?? []).filter(isMine);
  const visible = showAll ? (spends ?? []) : mineOnly;
  const hidden = (spends?.length ?? 0) - mineOnly.length;

  return (
    <section className={styles.panel} aria-labelledby="col2">
      <h2 id="col2" className={styles.heading}>
        <span className={styles.step}>2</span> Open spends
      </h2>

      <div className={styles.switcher} role="group" aria-label="Act as">
        <span className="label">Acting as</span>
        <div className={styles.switchRow}>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              className={`btn ${styles.switchBtn} ${active === r ? styles.switchOn : ""}`}
              aria-pressed={active === r}
              onClick={() => setActive(r)}
              title={addresses[r]}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <p className={styles.hint}>
          Payer and recipient are barred from challenging. Try it as either of them to watch the contract refuse.
        </p>
      </div>

      {dataError && (
        <p className={styles.error} role="alert">
          Could not read the contract: {dataError}
        </p>
      )}

      {spends === undefined && !dataError && <p className={styles.empty}>Reading the contract…</p>}

      {spends !== undefined && visible.length === 0 && (
        <div className={styles.emptyBox}>
          <p className={styles.emptyTitle}>{showAll ? "No spends on this contract yet." : "None of your demo accounts has a spend yet."}</p>
          <p className={styles.hint}>
            Seed the demo accounts in the top bar, then press “Lock funds” in column 1. Your spend will appear here with
            a live challenge window.
          </p>
        </div>
      )}

      {hidden > 0 && (
        <button type="button" className="btn btnQuiet" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show only my spends" : `Also show ${hidden} spend${hidden === 1 ? "" : "s"} from other visitors`}
        </button>
      )}

      <ol className={styles.cards}>
        {visible.map((s) => (
          <SpendCard key={s.id} spend={s} selected={selected === s.id} onSelect={() => onSelect(s.id)} />
        ))}
      </ol>
    </section>
  );
}

function SpendCard({ spend, selected, onSelect }: { spend: Spend; selected: boolean; onSelect: () => void }) {
  const { chainNow, config, run, active, busy, addresses } = useCourt();
  const [error, setError] = useState<string | null>(null);
  const deadline = activeDeadline(spend);
  const left = deadline !== null && config ? countdown(deadline, chainNow, config.tickSeconds) : null;
  const windowOpen = spend.status === "open" && left !== null && !left.closed;
  const awaitingFinalize = (spend.status === "open" || spend.status === "cleared") && left?.closed === true;
  const total = config ? config.windowTicks : 3;
  const pct = left && config ? Math.min(100, (left.secondsLeft / config.windowSeconds) * 100) : 0;

  async function finalize() {
    setError(null);
    const res = await run("Finalize spend", active, "finalize", [BigInt(spend.id)]);
    if (!res.ok) setError(res.error);
  }

  return (
    <li className={`${styles.card} ${selected ? styles.cardSelected : ""}`}>
      <button type="button" className={styles.cardHead} onClick={onSelect} aria-pressed={selected}>
        <span className="mono">#{spend.id}</span>
        <StatusChip status={spend.status} windowClosed={left?.closed === true} />
        {left && !left.closed && (
          <span className={`mono ${styles.ticks}`}>
            {left.ticksLeft} of {total} ticks · {formatClock(left.secondsLeft)}
          </span>
        )}
        {left?.closed && <span className={`mono ${styles.ticks}`}>window closed</span>}
      </button>

      <p className={`serif ${styles.cardMandate}`}>{spend.mandate}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Amount</dt>
          <dd className="mono">{formatUsdc(spend.amount)}</dd>
        </div>
        <div>
          <dt>Bond</dt>
          <dd className="mono">{formatUsdc(spend.bond)}</dd>
        </div>
        <div>
          <dt>Payer</dt>
          <dd>
            <WhoName addresses={addresses} address={spend.payer} />
          </dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd>
            <WhoName addresses={addresses} address={spend.recipient} />
          </dd>
        </div>
      </dl>
      <p className={styles.trace}>
        <span className="mono">{spend.trace}</span> ·{" "}
        <a href={spend.evidenceUrl} target="_blank" rel="noreferrer">
          cited page
        </a>
      </p>

      {left && !left.closed && (
        <div className={styles.bar} aria-hidden="true">
          <div className={styles.barFill} style={{ width: `${pct}%` }} />
        </div>
      )}

      {windowOpen && <p className={styles.provisional}>Final only if nobody funds a second look.</p>}

      {windowOpen && <ChallengeForm spend={spend} />}

      {awaitingFinalize && (
        <div className={styles.actionRow}>
          <p className={styles.hint}>
            {spend.status === "open"
              ? "Nobody challenged in time. Anyone can now release the payment."
              : "The appeal window has lapsed. Anyone can now release the payment."}
          </p>
          <button type="button" className="btn btnPrimary" onClick={finalize} disabled={busy}>
            Finalize and pay {formatUsdc(spend.amount)}
          </button>
        </div>
      )}

      {spend.status === "challenged" && (
        <p className={styles.hint}>
          A second look is funded. The ruling is in column 3; funds stay locked until the panel decides.
        </p>
      )}
      {spend.status === "cleared" && left && !left.closed && (
        <p className={styles.hint}>
          The challenge failed, but the payout waits out the appeal window in case the challenger appeals.
        </p>
      )}
      {spend.status === "final" && (
        <p className={styles.settled}>Settled: {formatUsdc(spend.amount)} released to the recipient.</p>
      )}
      {spend.status === "reverted" && (
        <p className={styles.settled}>Settled: spend reverted, {formatUsdc(spend.amount)} returned to the payer.</p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function ChallengeForm({ spend }: { spend: Spend }) {
  const { run, active, busy, cases, config } = useCourt();
  const slug = SCENARIO_ORDER.map((k) => SCENARIOS[k]).find((s) => spend.evidenceUrl.endsWith(`/${s.slug}`));
  const [claim, setClaim] = useState(slug?.claim ?? "");
  const [counter, setCounter] = useState(spend.evidenceUrl);
  const [precedent, setPrecedent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bond = formatUsdc(spend.bond);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await run(`Challenge spend #${spend.id}`, active, "challenge", [
      BigInt(spend.id),
      claim,
      counter,
      BigInt(precedent),
    ]);
    if (!res.ok) setError(res.error);
  }

  return (
    <form onSubmit={submit} className={styles.challenge}>
      <label className="label" htmlFor={`claim-${spend.id}`}>
        Fund a second look
      </label>
      <textarea
        id={`claim-${spend.id}`}
        className="field"
        value={claim}
        onChange={(e) => setClaim(e.target.value)}
        placeholder="What does the evidence say that the mandate forbids?"
        rows={3}
        maxLength={600}
        required
      />
      <label className="label" htmlFor={`counter-${spend.id}`}>
        Counter page (optional)
      </label>
      <input
        id={`counter-${spend.id}`}
        className="field mono"
        value={counter}
        onChange={(e) => setCounter(e.target.value)}
        spellCheck={false}
      />
      {cases !== undefined && cases.length > 0 && (
        <>
          <label className="label" htmlFor={`prec-${spend.id}`}>
            Cite a prior ruling (optional)
          </label>
          <select
            id={`prec-${spend.id}`}
            className="field"
            value={precedent}
            onChange={(e) => setPrecedent(Number(e.target.value))}
          >
            <option value={0}>No precedent</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                Case #{c.id} · {c.label} · {c.reason.slice(0, 50)}
              </option>
            ))}
          </select>
        </>
      )}
      <button type="submit" className="btn" disabled={busy}>
        Challenge as {ROLE_LABEL[active]} · post {bond} bond
      </button>
      <p className={styles.hint}>
        Win and you collect both bonds. Lose and the bond is slashed.
        {config ? ` A tick is ${formatClock(config.tickSeconds)}.` : ""}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
