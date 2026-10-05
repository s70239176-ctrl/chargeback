"use client";

import { useEffect, useState } from "react";
import { AMOUNT_MICROS, MANDATE, SCENARIOS, SCENARIO_ORDER, fixtureUrl, type Scenario } from "../demo/script.ts";
import { useCourt } from "../lib/court.tsx";
import { bondFor, formatUsdc, parseUsdc, MICROS } from "../lib/money.ts";
import styles from "./Panels.module.css";

export function OpenSpendPanel({ fixtureBase }: { fixtureBase: string }) {
  const { run, addresses, balances, config, busy } = useCourt();
  const [scenario, setScenario] = useState<Scenario["key"]>("short");
  const [mandate, setMandate] = useState(MANDATE);
  const [url, setUrl] = useState("");
  const [trace, setTrace] = useState(SCENARIOS.short.trace);
  const [amount, setAmount] = useState(String(AMOUNT_MICROS / MICROS));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fixtureBase) setUrl(fixtureUrl(fixtureBase, SCENARIOS[scenario].slug));
  }, [fixtureBase, scenario]);

  const micros = parseUsdc(amount);
  const bond = micros === null ? null : bondFor(micros, config?.bondBps, config?.minBond);
  const total = micros !== null && bond !== null ? micros + bond : null;
  const minAmount = config?.minAmount ?? MICROS;
  const amountProblem =
    micros === null ? "Enter an amount like 100 or 12.5." : micros < minAmount ? `Minimum is ${formatUsdc(minAmount)}.` : null;
  const payerBal = balances.payer;
  const short = total !== null && payerBal !== undefined && payerBal < total;

  function pick(key: Scenario["key"]) {
    setScenario(key);
    setTrace(SCENARIOS[key].trace);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (micros === null || amountProblem) return;
    setError(null);
    const res = await run("Open spend", "payer", "open_spend", [addresses.recipient, BigInt(micros), mandate, url, trace]);
    if (!res.ok) setError(res.error);
  }

  return (
    <section className={styles.panel} aria-labelledby="col1">
      <h2 id="col1" className={styles.heading}>
        <span className={styles.step}>1</span> Open a spend
      </h2>
      <p className={styles.lede}>
        The payer locks the amount plus a bond behind a one-line mandate. Nothing reaches the recipient until the
        window closes or a ruling lands.
      </p>

      <form onSubmit={submit} className={styles.form}>
        <div>
          <span className="label">Demo evidence page</span>
          <div className={styles.chips} role="group" aria-label="Demo scenarios">
            {SCENARIO_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${styles.chipBtn} ${scenario === k ? "chipStrong" : ""}`}
                aria-pressed={scenario === k}
                onClick={() => pick(k)}
              >
                {SCENARIOS[k].chip}
              </button>
            ))}
          </div>
          <p className={styles.hint}>{SCENARIOS[scenario].blurb}</p>
        </div>

        <div>
          <label className="label" htmlFor="mandate">
            Mandate
          </label>
          <textarea
            id="mandate"
            className={`field serif ${styles.mandate}`}
            value={mandate}
            onChange={(e) => setMandate(e.target.value)}
            maxLength={600}
            rows={4}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="evidence">
            Evidence URL
          </label>
          <input
            id="evidence"
            className="field mono"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            spellCheck={false}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="trace">
            Agent trace
          </label>
          <input
            id="trace"
            className="field mono"
            value={trace}
            onChange={(e) => setTrace(e.target.value)}
            maxLength={300}
            required
          />
        </div>

        <div className={styles.amountRow}>
          <div>
            <label className="label" htmlFor="amount">
              Amount (USDC)
            </label>
            <input
              id="amount"
              className="field mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              aria-invalid={amountProblem !== null}
              required
            />
          </div>
          <dl className={styles.sums}>
            <div>
              <dt>Bond</dt>
              <dd className="mono">{bond === null ? "—" : formatUsdc(bond)}</dd>
            </div>
            <div>
              <dt>Locked</dt>
              <dd className="mono">{total === null ? "—" : formatUsdc(total)}</dd>
            </div>
          </dl>
        </div>
        {amountProblem && <p className={styles.problem}>{amountProblem}</p>}
        {short && (
          <p className={styles.problem}>
            Payer holds {formatUsdc(payerBal ?? 0)}, which is less than {formatUsdc(total ?? 0)}.{" "}
            Seed the demo accounts first.
          </p>
        )}

        <button type="submit" className="btn btnPrimary" disabled={busy || amountProblem !== null || !url}>
          {total === null ? "Lock funds" : `Lock ${formatUsdc(total)} as Payer`}
        </button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
