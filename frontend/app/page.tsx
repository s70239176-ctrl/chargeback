"use client";

import { useState } from "react";
import { FixtureBanner } from "../components/FixtureBanner";
import { OpenSpendPanel } from "../components/OpenSpendPanel";
import { RulingPanel } from "../components/RulingPanel";
import { SpendsPanel } from "../components/SpendsPanel";
import { TopBar } from "../components/TopBar";
import { TxTape } from "../components/TxTape";
import { chainConfig } from "../lib/config";
import { CourtProvider, useCourt } from "../lib/court";
import { nextStep } from "../lib/guide";
import { useFixtureBase } from "../lib/fixtureBase";
import styles from "../components/Shell.module.css";

export default function Page() {
  if (!chainConfig) return <NotConfigured />;
  return (
    <CourtProvider>
      <App />
    </CourtProvider>
  );
}

function NotConfigured() {
  return (
    <main className={styles.config}>
      <h1 className={styles.brand}>Chargeback</h1>
      <p className="serif">This build has no contract address, so there is nothing to talk to.</p>
      <p>
        Deploy the contract and write the settings the app reads:
      </p>
      <pre className="mono">{`cd frontend && npm install && cd ..
node deploy/deploy.mjs`}</pre>
      <p>
        That writes <span className="mono">frontend/.env.local</span> with{" "}
        <span className="mono">NEXT_PUBLIC_CHARGEBACK_ADDRESS</span>, the RPC URL and the chain id. On a host such as
        Vercel, set the same variables in the project settings.
      </p>
    </main>
  );
}

function App() {
  const fx = useFixtureBase();
  const { spends, active, addresses, chainNow, seeded, isMine } = useCourt();
  const [picked, setPicked] = useState<number | null>(null);

  const list = spends ?? [];
  const mine = list.filter(isMine);
  const fallback = mine.find((s) => s.challenge !== null) ?? mine[0];
  const selected = list.find((s) => s.id === picked) ?? fallback;

  return (
    <div className={styles.page}>
      <TopBar />
      <p className={styles.next} role="status">
        <span className={styles.nextLabel}>Next</span>
        {nextStep({ seeded, spends: mine, active, chainNow, addresses })}
      </p>
      <FixtureBanner fx={fx} />
      <main className={styles.columns}>
        <OpenSpendPanel fixtureBase={fx.base} />
        <SpendsPanel selected={selected?.id ?? null} onSelect={setPicked} />
        <RulingPanel spend={selected} />
      </main>
      <footer className={styles.foot}>
        Balances are a mock USDC ledger inside the contract. Rulings come from GenLayer validator consensus; this page
        only reads and relays them.
      </footer>
      <TxTape />
    </div>
  );
}
