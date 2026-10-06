"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { claimFor } from "../../demo/script.ts";
import { ROLE_LABEL } from "../../lib/accounts.ts";
import { activeDeadline, countdown, formatClock } from "../../lib/clock.ts";
import { useCourt } from "../../lib/court.tsx";
import { usd } from "../../lib/money.ts";
import type { Flow, Spend } from "../../lib/types.ts";
import { WhoName, TxLink } from "../shared.tsx";
import { Badge, Button, EmptyState, Field, Panel, Skeleton, StatusBadge, errorClass, hintClass, inputClass, monoClass } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import { DisputeTimeline } from "./DisputeTimeline.tsx";
import { EvidencePanel } from "./EvidencePanel.tsx";
import c from "./console.module.css";

const MEANING = {
  MISMATCH: { title: "Challenge upheld", body: "The panel found the pages contradict the mandate. The spend is reverted and the challenger collects both bonds.", tone: "positive" as const },
  MATCH: { title: "Challenge rejected", body: "The pages affirm the mandate. The challenger's bond is slashed and the recipient is paid.", tone: "neutral" as const },
  INCONCLUSIVE: { title: "Rejected, unproven", body: "The pages did not settle it. A challenger who cannot prove a contradiction loses the bond; funds never revert on doubt.", tone: "warning" as const },
};

export function SpendDetail({ id }: { id: number }) {
  const { spends, loading, dataError } = useCourt();
  if (loading || spends === undefined) {
    return (
      <div className={c.detailSkeleton}>
        <Skeleton h={28} w="40%" />
        <Skeleton h={64} w="30%" />
        <Skeleton h={220} />
      </div>
    );
  }
  const spend = spends.find((s) => s.id === id);
  if (!spend) {
    return (
      <EmptyState
        title={dataError ? "Could not read the contract." : `There is no spend #${id}.`}
        body={dataError ?? "It may be on a different deployment, or the number is wrong."}
        action={<Link href="/console/opportunities" className={c.rowLink}>Back to opportunities</Link>}
      />
    );
  }
  return <Loaded spend={spend} />;
}

function Loaded({ spend }: { spend: Spend }) {
  const { chainNow, config, addresses } = useCourt();
  const tick = config?.tickSeconds ?? 60;
  const ch = spend.challenge;
  const label = ch && ch.verdictLabel !== "" ? ch.verdictLabel : null;
  const dl = activeDeadline(spend);
  const left = dl !== null ? countdown(dl, chainNow, tick) : null;
  const actionRef = useRef<HTMLDivElement>(null);

  return (
    <div className={c.detail}>
      <nav aria-label="Breadcrumb" className={c.crumbs}>
        <Link href="/console/opportunities">Recovery</Link>
        <Icon name="chevron" size={12} />
        <span>Spend #{spend.id}</span>
      </nav>

      <header className={c.detailHead}>
        <div>
          <p className={c.kickerLine}>
            SPEND <span className="mono">#{spend.id}</span>
          </p>
          <h1 className={c.detailAmount}>{usd(spend.amount)}</h1>
          <div className={c.detailMeta}>
            <StatusBadge spend={spend} now={chainNow} tick={tick} />
            {label && <Badge tone={MEANING[label].tone}>{label}</Badge>}
            <span>Bond {usd(spend.bond)}</span>
            <span>
              <WhoName addresses={addresses} address={spend.payer} /> to <WhoName addresses={addresses} address={spend.recipient} />
            </span>
            {left && !left.closed && <span className={c.countdown}>{formatClock(left.secondsLeft)} left</span>}
          </div>
        </div>
        <div className={c.detailCta}>
          <Button variant="primary" onClick={() => actionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            {spend.status === "open" && left && !left.closed ? "Fund a second look" : "Jump to actions"}
          </Button>
          <a className={`${c.moreLink}`} href={spend.evidenceUrl} target="_blank" rel="noreferrer">
            View cited page <Icon name="external" size={13} />
          </a>
        </div>
      </header>

      <section className={c.mandateBlock} aria-label="Mandate">
        <p className={c.kicker}>Mandate</p>
        <p className={c.mandate}>{spend.mandate}</p>
        <p className={c.dim}>
          Agent trace: <span className="mono">{spend.trace}</span>
        </p>
      </section>

      <div className={c.detailGrid}>
        <div className={c.stack}>
          <Panel title="Timeline">
            <DisputeTimeline spend={spend} now={chainNow} />
          </Panel>
          <EvidencePanel spend={spend} />
        </div>

        <div className={c.stack}>
          <AnalysisBlock spend={spend} />
          <LedgerBlock spend={spend} />
          <div ref={actionRef} id="actions" style={{ scrollMarginTop: 80 }}>
            <ActionPanel spend={spend} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisBlock({ spend }: { spend: Spend }) {
  const { addresses, txs } = useCourt();
  const ch = spend.challenge;
  const label = ch && ch.verdictLabel !== "" ? ch.verdictLabel : null;
  const live = txs.find((t) => (t.fn === "rule" || t.fn === "rule_appeal") && t.phase !== "failed" && t.phase !== "accepted");

  return (
    <Panel title={<><Icon name="sparkle" size={12} /> Panel analysis</>} tone="intel">
      {!ch && <p className={c.dim}>No challenge has been funded, so the validator panel has not been asked. If someone funds a second look, its reasoning appears here.</p>}
      {ch && !label && (
        <>
          <p className={c.analysisLead}>{live ? "The validator panel is reading the pages." : "A challenge is waiting for the panel."}</p>
          <p className={c.dim}>
            Each validator fetches the evidence for itself and rules independently; consensus must agree on the label.
            {live?.detail ? ` Network stage: ${live.detail}.` : ""}
            {live?.hash ? <> Transaction <TxLink hash={live.hash} />.</> : null}
          </p>
        </>
      )}
      {ch && label && (
        <>
          <p className={c.verdictWord}>{label}</p>
          <p className={c.analysisLead}>{MEANING[label].title}</p>
          <blockquote className={c.reason}>{ch.verdictReason}</blockquote>
          <p className={c.dim}>{MEANING[label].body}</p>
          <ul className={c.trust}>
            <li><Icon name="check" size={13} /> Label agreed by independent validators, not set by any operator</li>
            <li><Icon name="check" size={13} /> Quote verified word for word on the cited page{label === "INCONCLUSIVE" ? " (none relied on here)" : ""}</li>
            <li><Icon name="check" size={13} /> Page text was treated as data; instructions inside it cannot set the label</li>
          </ul>
          <p className={c.caveat}>
            Validators are language models and can be wrong. {ch.appeals === 0 && ch.status === "rejected" ? "The challenger can appeal once." : ch.appeals === 1 ? "This ruling was re-run once on appeal." : ""}
          </p>
          <p className={c.dim}>
            Case #{ch.caseId} · challenged by <WhoName addresses={addresses} address={ch.challenger} />
          </p>
        </>
      )}
    </Panel>
  );
}

function LedgerBlock({ spend }: { spend: Spend }) {
  const { addresses } = useCourt();
  const ch = spend.challenge;
  const settled = spend.settlement.length > 0;
  const held: Flow[] = [{ to: spend.payer, amount: spend.amount + spend.bond, why: "amount and bond, held" }];
  if (ch) held.push({ to: ch.challenger, amount: ch.bond + ch.appealBond, why: "challenger bond, held" });
  const rows = settled ? spend.settlement : held;
  return (
    <Panel title={settled ? "Who got what" : "Held in the contract"}>
      <table className={c.ledger}>
        <tbody>
          {rows.map((f, i) => (
            <tr key={`${f.to}-${i}`}>
              <td><WhoName addresses={addresses} address={f.to} /></td>
              <td className={`mono ${settled ? c.in : ""}`}>{settled ? "+" : ""}{usd(f.amount)}</td>
              <td className={c.dim}>{f.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function ActionPanel({ spend }: { spend: Spend }) {
  const { run, active, addresses, busy, chainNow, config, cases } = useCourt();
  const tick = config?.tickSeconds ?? 60;
  const ch = spend.challenge;
  const dl = activeDeadline(spend);
  const left = dl !== null ? countdown(dl, chainNow, tick) : null;
  const [claim, setClaim] = useState(claimFor(spend.evidenceUrl, spend.mandate));
  const [counter, setCounter] = useState(spend.evidenceUrl);
  const [precedent, setPrecedent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function act(name: string, label: string, fn: "challenge" | "rule" | "appeal" | "rule_appeal" | "accept_ruling" | "finalize", args: bigint[] | (bigint | string)[]) {
    setError(null);
    setPending(name);
    const res = await run(label, active, fn, args);
    setPending(null);
    if (!res.ok) setError(res.error);
  }

  const iAmChallenger = ch !== null && ch.challenger.toLowerCase() === addresses[active].toLowerCase();
  const windowOpen = spend.status === "open" && left !== null && !left.closed;
  const canFinalize = (spend.status === "open" || spend.status === "cleared") && left?.closed === true;
  const canAppeal = ch !== null && ch.status === "rejected" && spend.status === "cleared" && ch.appeals === 0 && left?.closed === false;

  return (
    <Panel title={`Actions · acting as ${ROLE_LABEL[active]}`}>
      <div className={c.actions2}>
        {windowOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act("challenge", `Challenge spend #${spend.id}`, "challenge", [BigInt(spend.id), claim, counter, BigInt(precedent)]);
            }}
            className={c.form}
          >
            <p className={hintClass}>Final only if nobody funds a second look. Win and you collect both bonds; lose and yours is slashed. Payer and recipient are barred; try it as either to watch the contract refuse.</p>
            <Field label="Claim">
              {(id) => <textarea id={id} className={inputClass} rows={3} value={claim} onChange={(e) => setClaim(e.target.value)} maxLength={600} placeholder="What does the evidence say that the mandate forbids?" required />}
            </Field>
            <Field label="Counter page (optional)">
              {(id) => <input id={id} className={`${inputClass} ${monoClass}`} value={counter} onChange={(e) => setCounter(e.target.value)} spellCheck={false} />}
            </Field>
            {cases !== undefined && cases.length > 0 && (
              <Field label="Cite a prior ruling (optional)">
                {(id) => (
                  <select id={id} className={inputClass} value={precedent} onChange={(e) => setPrecedent(Number(e.target.value))}>
                    <option value={0}>No precedent</option>
                    {cases.map((x) => (
                      <option key={x.id} value={x.id}>Case #{x.id} · {x.label} · {x.reason.slice(0, 48)}</option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Button type="submit" variant="primary" loading={pending === "challenge"} disabled={busy}>
              Post {usd(spend.bond)} bond and challenge
            </Button>
          </form>
        )}

        {spend.status === "challenged" && ch && (
          <div className={c.form}>
            <p className={hintClass}>The label comes only from validator consensus. This call takes no verdict argument, and anyone may make it.</p>
            <Button
              variant="primary"
              loading={pending === "rule"}
              disabled={busy}
              onClick={() => act("rule", ch.status === "appealed" ? "Run the appeal panel" : "Convene the panel", ch.status === "appealed" ? "rule_appeal" : "rule", [BigInt(ch.id)])}
            >
              {ch.status === "appealed" ? "Run the appeal panel" : "Convene the panel"}
            </Button>
          </div>
        )}

        {canAppeal && ch && (
          <div className={c.form}>
            {iAmChallenger ? (
              <>
                <p className={hintClass}>Appeal once with a second bond of {usd(ch.bond)}, or accept the ruling to settle now.</p>
                <div className={c.twoBtn}>
                  <Button loading={pending === "appeal"} disabled={busy} onClick={() => act("appeal", "Appeal ruling", "appeal", [BigInt(ch.id)])}>
                    Appeal · {usd(ch.bond)}
                  </Button>
                  <Button loading={pending === "accept"} disabled={busy} onClick={() => act("accept", "Accept ruling", "accept_ruling", [BigInt(ch.id)])}>
                    Accept ruling
                  </Button>
                </div>
              </>
            ) : (
              <p className={hintClass}>
                Only the losing challenger can appeal. Switch to <strong><WhoName addresses={addresses} address={ch.challenger} /></strong> in the sidebar.
              </p>
            )}
          </div>
        )}

        {canFinalize && (
          <div className={c.form}>
            <p className={hintClass}>{spend.status === "open" ? "Nobody challenged in time." : "The appeal window has lapsed."} Anyone can now release the payment.</p>
            <Button variant="positive" loading={pending === "finalize"} disabled={busy} onClick={() => act("finalize", "Finalize spend", "finalize", [BigInt(spend.id)])}>
              Finalize and pay {usd(spend.amount)}
            </Button>
          </div>
        )}

        {(spend.status === "final" || spend.status === "reverted") && (
          <p className={hintClass}>
            Settled. {spend.status === "reverted" ? `${usd(spend.amount)} went back to the payer.` : `${usd(spend.amount)} was released to the recipient.`} Nothing further can change.
          </p>
        )}
        {error && (
          <p className={errorClass} role="alert">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
