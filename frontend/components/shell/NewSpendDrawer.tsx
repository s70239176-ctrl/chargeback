"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AMOUNT_MICROS, MANDATE, SCENARIOS, SCENARIO_ORDER, fixtureUrl, type Scenario } from "../../demo/script.ts";
import { useCourt } from "../../lib/court.tsx";
import { useFixtureBase } from "../../lib/fixtureBase.ts";
import { MICROS, bondFor, parseUsdc, usd } from "../../lib/money.ts";
import { Button, Drawer, Field, FilterChips, errorClass, hintClass, inputClass, monoClass } from "../ui/index.tsx";

export function NewSpendDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { run, addresses, balances, config, busy } = useCourt();
  const fx = useFixtureBase();
  const [scenario, setScenario] = useState<Scenario["key"]>("short");
  const [mandate, setMandate] = useState(MANDATE);
  const [url, setUrl] = useState("");
  const [trace, setTrace] = useState<string>(SCENARIOS.short.trace);
  const [amount, setAmount] = useState(String(AMOUNT_MICROS / MICROS));
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (fx.base) setUrl(fixtureUrl(fx.base, SCENARIOS[scenario].slug));
  }, [fx.base, scenario]);

  const micros = parseUsdc(amount);
  const bond = micros === null ? null : bondFor(micros, config?.bondBps, config?.minBond);
  const total = micros !== null && bond !== null ? micros + bond : null;
  const minAmount = config?.minAmount ?? MICROS;
  const problem =
    micros === null ? "Enter an amount like 100 or 12.5." : micros < minAmount ? `The minimum is ${usd(minAmount)}.` : null;
  const payer = balances.payer;
  const short = total !== null && payer !== undefined && payer < total;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (micros === null || problem) return;
    setError(null);
    setSubmitting(true);
    const res = await run("Open spend", "payer", "open_spend", [addresses.recipient, BigInt(micros), mandate, url, trace]);
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    onClose();
    router.push("/console/opportunities");
  }

  return (
    <Drawer open={open} onClose={onClose} title="Open a spend">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <p className={hintClass}>
          The payer locks the amount plus a bond behind a one-paragraph mandate. Nothing reaches the recipient until the
          challenge window closes or a ruling lands.
        </p>

        <div>
          <p className={hintClass} style={{ marginBottom: 8 }}>
            Demo evidence page
          </p>
          <FilterChips
            label="Demo scenarios"
            value={scenario}
            onChange={(k) => {
              setScenario(k);
              setTrace(SCENARIOS[k].trace);
            }}
            options={SCENARIO_ORDER.map((k) => ({ id: k, label: SCENARIOS[k].chip }))}
          />
          <p className={hintClass} style={{ marginTop: 8 }}>
            {SCENARIOS[scenario].blurb}
          </p>
        </div>

        {fx.isPrivate && (
          <div style={{ border: "1px solid rgba(244,184,96,.35)", background: "var(--warning-bg)", borderRadius: 10, padding: 12 }}>
            <p className={hintClass} style={{ color: "var(--warning)" }}>
              This app is on localhost, so Studio&apos;s validators cannot read its demo pages. Run a tunnel (for example
              cloudflared tunnel --url http://localhost:3000) and paste its https address.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                className={`${inputClass} ${monoClass}`}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="https://your-tunnel.trycloudflare.com"
                aria-label="Public base URL of this app"
              />
              <Button disabled={!/^https:\/\/[^\s/]+/.test(host.trim())} onClick={() => fx.setBase(host)}>
                Use
              </Button>
            </div>
          </div>
        )}

        <Field label="Mandate">
          {(id) => <textarea id={id} className={inputClass} value={mandate} onChange={(e) => setMandate(e.target.value)} maxLength={600} rows={4} required />}
        </Field>
        <Field label="Evidence URL" hint="The page the validators will read for themselves.">
          {(id) => <input id={id} className={`${inputClass} ${monoClass}`} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} required />}
        </Field>
        <Field label="Agent trace">
          {(id) => <input id={id} className={`${inputClass} ${monoClass}`} value={trace} onChange={(e) => setTrace(e.target.value)} maxLength={300} required />}
        </Field>
        <Field label="Amount (USD)" error={problem}>
          {(id) => <input id={id} className={`${inputClass} ${monoClass}`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-invalid={problem !== null} required />}
        </Field>

        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: 0 }}>
          <div>
            <dt className={hintClass}>Bond (10%, min $5)</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{bond === null ? "—" : usd(bond)}</dd>
          </div>
          <div>
            <dt className={hintClass}>Locked from the payer</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{total === null ? "—" : usd(total)}</dd>
          </div>
        </dl>
        {short && (
          <p className={errorClass}>
            The payer holds {usd(payer ?? 0)}, which is less than {usd(total ?? 0)}. Seed the demo accounts first.
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting || busy} disabled={problem !== null || !url}>
          {total === null ? "Lock funds" : `Lock ${usd(total)} as Payer`}
        </Button>
        {error && (
          <p className={errorClass} role="alert">
            {error}
          </p>
        )}
      </form>
    </Drawer>
  );
}
