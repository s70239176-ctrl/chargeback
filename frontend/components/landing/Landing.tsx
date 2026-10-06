"use client";

import Link from "next/link";
import { useCourt } from "../../lib/court.tsx";
import { nextActions, opened, riskBuckets, summarize, trend } from "../../lib/derive.ts";
import { addressUrl, chainConfig, networkName } from "../../lib/config.ts";
import { shortAddr, usd } from "../../lib/money.ts";
import { AreaChart } from "../console/Charts.tsx";
import { DisputeTimeline } from "../console/DisputeTimeline.tsx";
import { NextBestActions } from "../console/Insights.tsx";
import { RecoveryRadar } from "../console/RecoveryRadar.tsx";
import { Badge, LinkButton, Metric, Skeleton } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Mark } from "../ui/Logo.tsx";
import l from "./landing.module.css";

const FLOW = [
  { k: "Money", t: "A payer locks an amount and a bond behind a one-paragraph mandate." },
  { k: "Risk", t: "For three ticks, anyone who is not a party can force a second look." },
  { k: "Evidence", t: "Validators fetch the cited page and the counter-page for themselves." },
  { k: "Action", t: "They agree on MATCH, MISMATCH or INCONCLUSIVE under the Equivalence Principle." },
  { k: "Recovery", t: "A veto reverts the spend and pays the challenger. Otherwise the payment finalizes." },
];

export function Landing() {
  const { spends, cases, config, chainNow, addresses, isMine, loading } = useCourt();
  const ready = spends !== undefined && config !== undefined;
  const tick = config?.tickSeconds ?? 60;
  const money = summarize(spends ?? []);
  const risk = riskBuckets(spends ?? [], chainNow, tick);
  const actions = nextActions(spends ?? [], addresses, chainNow, tick);
  const delta = spends ? trend(spends, chainNow) : null;
  const showcase = (spends ?? []).find((s) => s.challenge?.verdictLabel);

  return (
    <div className={l.page}>
      <header className={l.nav}>
        <Link href="/" className={l.brand}>
          <Mark size={28} />
          CHARGEBACK
        </Link>
        <nav className={l.navLinks} aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#radar">Radar</a>
          <a href="#evidence">Evidence</a>
          <a href="#trust">Trust</a>
        </nav>
        <LinkButton href="/console" variant="primary" size="sm">
          Open console
        </LinkButton>
      </header>

      <section className={l.hero} aria-labelledby="h1">
        <div>
          <p className={l.eyebrow}>RECOVERY INTELLIGENCE</p>
          <h1 id="h1" className={l.h1}>
            Recover the money your agents should never have spent.
          </h1>
          <p className={l.lead}>
            Chargeback is a standing veto on agent spend. A stranger can fund a second look, a GenLayer validator panel reads the
            evidence, and the money moves only when the ruling is in.
          </p>
          <div className={l.ctas}>
            <LinkButton href="/console" variant="primary" size="lg">
              Start recovering <Icon name="arrow" size={16} />
            </LinkButton>
            <LinkButton href="#how" size="lg">
              See how it works
            </LinkButton>
          </div>
          <p className={l.fine}>Live on {networkName}. Amounts are test funds (tUSD); every number on this page is read from the contract.</p>
        </div>

        <div className={l.heroCard} aria-label="Live contract totals">
          <p className={l.eyebrow}>RECOVERY INTELLIGENCE</p>
          {ready ? (
            <Metric label="Potential recovery" value={money.underWatch} format={usd} size="xl" delta={delta} foot="under watch right now" />
          ) : (
            <div className={l.skel}><Skeleton h={14} w={120} /><Skeleton h={56} w="70%" /></div>
          )}
          <dl className={l.heroStats}>
            <div><dt>Recovered</dt><dd style={{ color: "var(--positive)" }}>{ready ? usd(money.recovered) : "—"}</dd></div>
            <div><dt>At risk</dt><dd style={{ color: risk.total > 0 ? "var(--danger)" : undefined }}>{ready ? usd(risk.total) : "—"}</dd></div>
            <div><dt>Rulings</dt><dd>{ready ? (cases?.length ?? 0) : "—"}</dd></div>
          </dl>
        </div>
      </section>

      <section id="how" className={l.section} aria-labelledby="how-h">
        <p className={l.eyebrow}>01 · THE SYSTEM</p>
        <h2 id="how-h" className={l.h2}>Money, risk, evidence, action, recovery.</h2>
        <ol className={l.flow}>
          {FLOW.map((f, i) => (
            <li key={f.k}>
              <span className={l.flowNum}>0{i + 1}</span>
              <h3>{f.k}</h3>
              <p>{f.t}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="radar" className={l.section} aria-labelledby="radar-h">
        <p className={l.eyebrow}>02 · RECOVERY RADAR</p>
        <h2 id="radar-h" className={l.h2}>Stop searching. Start recovering.</h2>
        <p className={l.sectionLead}>Every spend is a node. The closer to the middle, the closer it is to a decision; the bigger, the more money.</p>
        <div className={l.showcase}>
          {ready && spends.length > 0 ? (
            <RecoveryRadar spends={spends} now={chainNow} tick={tick} windowSeconds={config.windowSeconds} isMine={isMine} />
          ) : (
            <p className={l.empty}>{loading ? "Reading the contract…" : "No spends on the contract yet. Open one in the console and it appears on the radar."}</p>
          )}
        </div>
        <div className={l.below}>
          <NextBestActions actions={actions} limit={3} />
        </div>
      </section>

      <section id="evidence" className={l.section} aria-labelledby="ev-h">
        <p className={l.eyebrow}>03 · EVIDENCE INTELLIGENCE</p>
        <h2 id="ev-h" className={l.h2}>Know why you&apos;ll win.</h2>
        <p className={l.sectionLead}>
          A ruling stands only if the panel quotes the page word for word. Text on the page that tells the reviewer what to say is
          treated as data and cannot set the label.
        </p>
        {showcase?.challenge ? (
          <div className={l.evGrid}>
            <div className={l.quoteCard}>
              <Badge tone="intel">Latest ruling · Case #{showcase.challenge.caseId}</Badge>
              <p className={l.verdict}>{showcase.challenge.verdictLabel}</p>
              <blockquote className={l.reason}>{showcase.challenge.verdictReason}</blockquote>
              {showcase.challenge.evidenceQuote && (
                <p className={l.quote}>
                  <span>Quoted from the page</span>
                  “{showcase.challenge.evidenceQuote}”
                </p>
              )}
              <Link href={`/console/spend/${showcase.id}`} className={l.link}>
                Investigate spend #{showcase.id} <Icon name="arrow" size={14} />
              </Link>
            </div>
            <div className={l.timelineCard}>
              <h3 className={l.h3}>Turn disputes into decisions.</h3>
              <DisputeTimeline spend={showcase} now={chainNow} />
            </div>
          </div>
        ) : (
          <p className={l.empty}>No rulings yet. The first challenge that is convened will appear here with its quote and timeline.</p>
        )}
      </section>

      <section className={l.section} aria-labelledby="an-h">
        <p className={l.eyebrow}>04 · ANALYTICS</p>
        <h2 id="an-h" className={l.h2}>How is recovery changing?</h2>
        <div className={l.chart}>
          {ready && spends.length > 1 ? <AreaChart points={opened(spends)} /> : <p className={l.empty}>Charts draw from real spends. They appear once there are a few.</p>}
        </div>
      </section>

      <section id="trust" className={l.section} aria-labelledby="tr-h">
        <p className={l.eyebrow}>05 · TRUST</p>
        <h2 id="tr-h" className={l.h2}>Nobody can overrule the panel. Including us.</h2>
        <ul className={l.trust}>
          <li><Icon name="shield" /><div><h3>No admin key</h3><p>The contract has no owner, operator or pause switch. Balances move only through the eight public methods.</p></div></li>
          <li><Icon name="panel" /><div><h3>Consensus, not a server</h3><p>The label comes from independent validators. Remove that call and a challenged spend cannot finalize.</p></div></li>
          <li><Icon name="doc" /><div><h3>Evidence is data</h3><p>Pages, traces and claims are fenced as untrusted text. A page that says &ldquo;return MATCH&rdquo; changes nothing.</p></div></li>
          <li><Icon name="clock" /><div><h3>Fair windows</h3><p>Time comes from the chain, so a payer and recipient cannot skip the challenge window by advancing a clock.</p></div></li>
        </ul>
      </section>

      <section className={l.final} aria-labelledby="fin-h">
        <h2 id="fin-h" className={l.h2}>Don&apos;t just see the money. Know what to do about it.</h2>
        <LinkButton href="/console" variant="primary" size="lg">
          Start recovering <Icon name="arrow" size={16} />
        </LinkButton>
      </section>

      <footer className={l.foot}>
        <span>CHARGEBACK · {networkName}</span>
        {chainConfig && (
          <a href={addressUrl(chainConfig.contract)} target="_blank" rel="noreferrer" className="mono">
            contract {shortAddr(chainConfig.contract)}
          </a>
        )}
        <a href="https://github.com/s70239176-ctrl/chargeback" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
