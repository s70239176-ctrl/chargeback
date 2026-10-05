"use client";

import Link from "next/link";
import { ROLES, ROLE_LABEL } from "../../lib/accounts.ts";
import { addressUrl, chainConfig, networkName, txUrl } from "../../lib/config.ts";
import { useCourt } from "../../lib/court.tsx";
import { hostTally, labelTally, moneyByOutcome, opened, outcomeTally, summarize, vetoRate } from "../../lib/derive.ts";
import { useFixtureBase } from "../../lib/fixtureBase.ts";
import { formatClock } from "../../lib/clock.ts";
import { shortAddr, usd } from "../../lib/money.ts";
import { WhoName } from "../shared.tsx";
import { Badge, Button, EmptyState, Field, Metric, Panel, Skeleton, inputClass, monoClass } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import { AreaChart, BarList, ChartCard } from "./Charts.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { useState } from "react";
import c from "./console.module.css";

/** Transactions: every ledger entry the contract has paid out, with the spend that caused it. */
export function TransactionsPage() {
  const { spends, addresses, loading } = useCourt();
  const rows = (spends ?? []).flatMap((s) => s.settlement.map((f, i) => ({ s, f, key: `${s.id}-${i}` }))).sort((a, b) => b.s.id - a.s.id);
  const held = (spends ?? []).filter((s) => s.settlement.length === 0);
  return (
    <>
      <PageHeader title="Transactions" sub="Every payout the contract has made. Money moves only after a ruling or a lapsed window, and each entry states why." />
      {held.length > 0 && (
        <p className={c.totalLine}>
          {held.length} {held.length === 1 ? "spend is" : "spends are"} still holding <strong>{usd(held.reduce((n, s) => n + s.amount + s.bond + (s.challenge ? s.challenge.bond + s.challenge.appealBond : 0), 0))}</strong> in the contract.
        </p>
      )}
      <Panel flush>
        {loading || spends === undefined ? (
          <div className={c.tablePad}><Skeleton h={120} /></div>
        ) : rows.length === 0 ? (
          <div className={c.tablePad}>
            <EmptyState title="No payouts yet." body="When a spend finalizes or a ruling lands, each payment appears here with the reason it moved." />
          </div>
        ) : (
          <table className={c.table}>
            <thead>
              <tr>
                <th scope="col">Spend</th>
                <th scope="col">Paid to</th>
                <th scope="col" className={c.num}>Amount</th>
                <th scope="col">Why</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, f, key }) => (
                <tr key={key} className={c.row}>
                  <td data-label="Spend"><Link href={`/console/spend/${s.id}`} className="mono">#{s.id}</Link></td>
                  <td data-label="Paid to"><WhoName addresses={addresses} address={f.to} /></td>
                  <td data-label="Amount" className={`${c.num} mono ${c.in}`}>+{usd(f.amount)}</td>
                  <td data-label="Why" className={c.mandateCell}><div className={c.clamp}>{f.why}</div></td>
                  <td data-label="Outcome"><Badge tone={s.status === "reverted" ? "positive" : "neutral"}>{s.status === "reverted" ? "Recovered" : "Released"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}

export function AnalyticsPage() {
  const { spends, cases, loading } = useCourt();
  if (loading || spends === undefined) {
    return (
      <>
        <PageHeader title="Analytics" />
        <Skeleton h={240} />
      </>
    );
  }
  const money = summarize(spends);
  const rate = vetoRate(spends);
  const series = opened(spends);
  const hosts = hostTally(spends).slice(0, 5);
  const labels = labelTally(cases ?? []);
  return (
    <>
      <PageHeader title="Analytics" sub="Each chart answers one question about the court. Everything is computed from the contract's spends and rulings." />
      <div className={c.kpis}>
        <Metric label="Veto rate" value={rate === null ? 0 : Math.round(rate * 100)} format={(v) => (rate === null ? "—" : `${v}%`)} foot="of ruled challenges reverted the spend" />
        <Metric label="Recovered" value={money.recovered} format={usd} tone="positive" foot="returned to payers by a veto" />
        <Metric label="Under watch" value={money.underWatch} format={usd} foot="still inside a window" />
        <Metric label="Rulings" value={cases?.length ?? 0} format={(v) => String(Math.round(v))} foot="numbered cases on record" />
      </div>
      {spends.length === 0 ? (
        <EmptyState title="No data to chart yet." body="Charts draw from real spends and rulings. Open a spend, challenge it and convene the panel to populate them." />
      ) : (
        <div className={c.chartGrid}>
          <ChartCard question="How is activity changing?" answer={`${spends.length} spends opened, grouped over the span they arrived in.`}>
            <AreaChart points={series} />
          </ChartCard>
          <ChartCard question="Where does the money end up?" answer="Dollars by outcome. Vetoed money went back to payers; released money reached recipients.">
            <BarList items={moneyByOutcome(spends)} format={usd} tone="var(--positive)" />
          </ChartCard>
          <ChartCard question="How does the panel rule?" answer="MISMATCH upholds a challenge. MATCH and INCONCLUSIVE reject it.">
            <BarList items={labels} tone="var(--intel)" />
          </ChartCard>
          <ChartCard question="What happens to spends?" answer="Count of spends by how they ended, or that they are still open.">
            <BarList items={outcomeTally(spends)} />
          </ChartCard>
          <ChartCard question="Where is evidence weakest?" answer="Evidence hosts ranked by how many of their spends were vetoed. A host that keeps losing is a weak source.">
            {hosts.length === 0 ? (
              <p className={c.dim}>No evidence hosts yet.</p>
            ) : (
              <BarList items={hosts.map((h) => ({ label: `${h.host} (${h.spends})`, value: h.reverted }))} tone="var(--warning)" />
            )}
          </ChartCard>
        </div>
      )}
    </>
  );
}

export function SettingsPage() {
  const { addresses, balances, active, setActive, seededRoles, resetAccounts, config, run, busy, accountsReady } = useCourt();
  const fx = useFixtureBase();
  const [host, setHost] = useState("");
  return (
    <>
      <PageHeader title="Settings" sub="Demo accounts, network and evidence host. Nothing here is a secret: Studionet is gasless and the keys are throwaway." />
      <div className={c.cols2}>
        <Panel title="Demo accounts">
          <ul className={c.accounts}>
            {ROLES.map((r) => (
              <li key={r} className={c.accountRow}>
                <div>
                  <p className={c.analysisLead} style={{ margin: 0 }}>
                    {ROLE_LABEL[r]} {active === r && <Badge tone="info">acting</Badge>}
                  </p>
                  <p className="mono" style={{ margin: "2px 0 0", color: "var(--text-3)", fontSize: 12 }}>
                    {addresses[r] ? <a href={addressUrl(addresses[r])} target="_blank" rel="noreferrer">{shortAddr(addresses[r])}</a> : "…"}
                    {" · "}
                    {balances[r] === undefined ? "…" : usd(balances[r] ?? 0)}
                  </p>
                </div>
                <div className={c.accountBtns}>
                  {!seededRoles[r] && (
                    <Button size="sm" disabled={busy || !accountsReady} onClick={() => void run(`Seed ${ROLE_LABEL[r]}`, r, "seed", [500_000_000n])}>
                      Seed $500
                    </Button>
                  )}
                  <Button size="sm" variant={active === r ? "primary" : "secondary"} onClick={() => setActive(r)} aria-pressed={active === r}>
                    {active === r ? "Acting" : "Act as"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className={c.dim}>Keys are generated in this browser and kept in localStorage. They hold mock USDC only.</p>
          <Button variant="danger" size="sm" onClick={resetAccounts} disabled={busy}>
            Generate new demo keys
          </Button>
        </Panel>

        <Panel title="Network and contract">
          <dl className={c.defs}>
            <div><dt>Network</dt><dd>{networkName}</dd></div>
            <div>
              <dt>Contract</dt>
              <dd className="mono">
                {chainConfig ? <a href={addressUrl(chainConfig.contract)} target="_blank" rel="noreferrer">{shortAddr(chainConfig.contract)}</a> : "not configured"}
              </dd>
            </div>
            <div><dt>Tick</dt><dd>{config ? formatClock(config.tickSeconds) : "…"}</dd></div>
            <div><dt>Challenge window</dt><dd>{config ? `${config.windowTicks} ticks · ${formatClock(config.windowSeconds)}` : "…"}</dd></div>
            <div><dt>Bond</dt><dd>{config ? `${config.bondBps / 100}% of the amount, minimum ${usd(config.minBond)}` : "…"}</dd></div>
          </dl>
          <Field label="Evidence host" hint={fx.isPrivate ? "This is localhost: validators cannot reach it. Paste a public https address." : "The demo evidence pages are served from here."}>
            {(id) => (
              <div style={{ display: "flex", gap: 8 }}>
                <input id={id} className={`${inputClass} ${monoClass}`} value={host || fx.base} onChange={(e) => setHost(e.target.value)} spellCheck={false} />
                <Button disabled={!/^https?:\/\/[^\s/]+/.test((host || fx.base).trim())} onClick={() => fx.setBase(host || fx.base)}>
                  Save
                </Button>
              </div>
            )}
          </Field>
        </Panel>
      </div>
    </>
  );
}

const PHASE_TONE = { signing: "neutral", pending: "intel", accepted: "positive", failed: "danger" } as const;

/** Activity: this session's transactions, and what needs attention. */
export function ActivityPage() {
  const { txs } = useCourt();
  return (
    <>
      <PageHeader title="Activity" sub="Transactions from this browser session, newest first." />
      {txs.length === 0 ? (
        <EmptyState title="Nothing yet." body="Transactions you send from the demo accounts appear here with their hash and the contract's own revert message if one is refused." />
      ) : (
        <Panel flush>
          <ul className={c.evList}>
            {[...txs].reverse().map((t) => (
              <li key={t.id} className={c.evRow}>
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>{t.label}</p>
                  <p className={c.dim} style={{ margin: "4px 0 0" }}>
                    As {ROLE_LABEL[t.role]} · {new Date(t.at).toLocaleTimeString()}
                    {t.error && <span style={{ color: "var(--danger)" }}> · {t.error}</span>}
                  </p>
                </div>
                <Badge tone={PHASE_TONE[t.phase]}>{t.phase === "pending" ? (t.detail ?? "pending").toLowerCase() : t.phase}</Badge>
                {t.hash ? (
                  <a href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="mono">{shortAddr(t.hash)}</a>
                ) : (
                  <span className={c.faint}>no hash</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

export function HelpPage() {
  return (
    <>
      <PageHeader title="Help" sub="How the court works, in the order you will meet it." />
      <div className={c.cols2}>
        <Panel title="The flow">
          <ol className={c.helpList}>
            <li><strong>Open.</strong> A payer locks an amount plus a bond behind a one-paragraph mandate and a cited page.</li>
            <li><strong>Challenge.</strong> Within three ticks a stranger posts an equal bond and a claim. Payer and recipient cannot.</li>
            <li><strong>Rule.</strong> Anyone convenes the panel. Validators fetch the pages themselves and agree on MATCH, MISMATCH or INCONCLUSIVE.</li>
            <li><strong>Settle.</strong> MISMATCH reverts the spend and pays the challenger. Otherwise the recipient is paid after the appeal window.</li>
            <li><strong>Appeal.</strong> The losing challenger may appeal once with a second bond.</li>
          </ol>
        </Panel>
        <Panel title="Shortcuts">
          <dl className={c.defs}>
            <div><dt>⌘ K / Ctrl K</dt><dd>Command palette</dd></div>
            <div><dt>↑ ↓ then ↵</dt><dd>Move and open in the palette</dd></div>
            <div><dt>Esc</dt><dd>Close the palette or a drawer</dd></div>
          </dl>
          <p className={c.dim}>
            Balances are mock USDC inside the contract. The hosted RPC allows about 30 requests a minute, so the console reads everything in one call and waits politely if it is rate-limited.
          </p>
          <Link href="/" className={c.insightLink}>Back to the overview <Icon name="arrow" size={13} /></Link>
        </Panel>
      </div>
    </>
  );
}
