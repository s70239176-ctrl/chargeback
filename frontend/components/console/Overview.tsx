"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCourt } from "../../lib/court.tsx";
import { nextActions, riskBuckets, summarize, trend } from "../../lib/derive.ts";
import { usd } from "../../lib/money.ts";
import { Button, EmptyState, LinkButton, Metric, Panel, Skeleton } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useShell } from "../shell/ShellContext.tsx";
import { IntelligencePanel, NextBestActions, RecoverySummary, RiskPanel } from "./Insights.tsx";
import { RecoveryRadar } from "./RecoveryRadar.tsx";
import c from "./console.module.css";

/** Mobile keeps one question: what is urgent, and what is next. The radar and tables live one tap away. */
function MobileFocus({ risk, top }: { risk: ReturnType<typeof riskBuckets>; top: ReturnType<typeof nextActions>[number] | undefined }) {
  const urgent = risk.closing.amount + risk.releasing.amount;
  return (
    <div className={c.mobileFocus}>
      <Link href="/console/opportunities" className={c.focusCard}>
        <span className={c.kicker}>Urgent</span>
        <span className={c.focusValue} style={{ color: urgent > 0 ? "var(--warning)" : undefined }}>{usd(urgent)}</span>
        <span className={c.dim}>{urgent > 0 ? "Releases without a second look soon" : "Nothing is about to release unchecked"}</span>
        <span className={c.focusCta}>Review <Icon name="arrow" size={14} /></span>
      </Link>
      {top && (
        <Link href={`/console/spend/${top.spendId}`} className={c.focusCard}>
          <span className={c.kicker}>Next opportunity</span>
          <span className={c.focusValue}>{usd(top.amount)}</span>
          <span className={c.dim}>{top.title}</span>
          <span className={c.focusCta}>Open <Icon name="arrow" size={14} /></span>
        </Link>
      )}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Working late." : h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
}

export function Overview() {
  const { spends, cases, config, chainNow, addresses, isMine, loading, dataError, seeded, run, accountsReady, busy, configured } = useCourt();
  const { openNewSpend } = useShell();
  const [hello, setHello] = useState("Hello.");
  useEffect(() => setHello(greeting()), []);

  if (!configured) {
    return <EmptyState title="This build has no contract address." body="Set NEXT_PUBLIC_CHARGEBACK_ADDRESS (see frontend/.env.example) and redeploy. Nothing here is mocked, so there is nothing to show without a contract." />;
  }
  if (loading || spends === undefined || config === undefined) {
    return (
      <div className={c.overview}>
        <Skeleton h={20} w={160} />
        <Skeleton h={72} w="42%" />
        <Skeleton h={360} />
      </div>
    );
  }

  const tick = config.tickSeconds;
  const money = summarize(spends);
  const risk = riskBuckets(spends, chainNow, tick);
  const actions = nextActions(spends, addresses, chainNow, tick);
  const delta = trend(spends, chainNow);

  return (
    <div className={c.overview}>
      <section className={c.hero} aria-labelledby="hero-title">
        <div>
          <p className={c.greeting} id="hero-title">{hello}</p>
          <Metric
            label="Under watch · could still be vetoed"
            value={money.underWatch}
            format={usd}
            size="xl"
            delta={delta}
            foot={spends.length === 0 ? undefined : `across ${spends.length} ${spends.length === 1 ? "spend" : "spends"}`}
          />
          <div className={c.heroCta}>
            <LinkButton href="/console/opportunities" variant="primary" size="lg">
              Review opportunities <Icon name="arrow" size={16} />
            </LinkButton>
            <LinkButton href="/console/analytics" size="lg">View analytics</LinkButton>
          </div>
        </div>
        <p className={c.heroNote}>
          Money → Risk → Evidence → Action → Recovery. Every number here is read from the contract; amounts are test funds (tUSD) on Studionet.
        </p>
      </section>

      {!seeded && accountsReady && (
        <Panel>
          <div className={c.onboard}>
            <div>
              <p className={c.analysisLead}>Start with the demo accounts.</p>
              <p className={c.dim}>Mint free test funds (tUSD) to the payer, recipient and stranger in this browser, then open a spend and play every side.</p>
            </div>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                for (const r of ["payer", "recipient", "stranger"] as const) void run(`Seed ${r}`, r, "seed", [500_000_000n]);
              }}
            >
              Seed demo accounts
            </Button>
          </div>
        </Panel>
      )}

      <MobileFocus risk={risk} top={actions[0]} />

      {dataError && <p role="alert" style={{ color: "var(--danger)" }}>Could not read the contract: {dataError}</p>}

      <div className={`${c.cols} ${c.desktopOnly}`}>
        <Panel title="Recovery radar" action={<span className={c.dim}>Closer to the middle = closer to a decision</span>} flush>
          {spends.length === 0 ? (
            <div style={{ padding: 20 }}>
              <EmptyState
                title="Nothing on the radar yet."
                body="Open a spend and it appears here, moving toward the centre as its challenge window runs down."
                action={<Button variant="primary" onClick={openNewSpend}>Open a spend</Button>}
              />
            </div>
          ) : (
            <RecoveryRadar spends={spends} now={chainNow} tick={tick} windowSeconds={config.windowSeconds} isMine={isMine} />
          )}
        </Panel>
        <RiskPanel risk={risk} top={actions[0]} />
      </div>

      <div className={c.desktopOnly}>
        <Panel>
          <RecoverySummary money={money} risk={risk} />
        </Panel>
      </div>

      <div className={c.cols2}>
        <NextBestActions actions={actions} />
        <IntelligencePanel spends={spends} cases={cases ?? []} risk={risk} />
      </div>
    </div>
  );
}
