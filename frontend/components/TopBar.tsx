"use client";

import { ROLES, ROLE_LABEL } from "../lib/accounts.ts";
import { addressUrl, chainConfig, networkName } from "../lib/config.ts";
import { formatUsdc, shortAddr } from "../lib/money.ts";
import { SEED_MICROS } from "../demo/script.ts";
import { useCourt } from "../lib/court.tsx";
import { formatClock } from "../lib/clock.ts";
import styles from "./Shell.module.css";

export function TopBar() {
  const { addresses, balances, active, setActive, run, busy, seeded, seededRoles, config, chainNow, chainReady, resetAccounts } =
    useCourt();

  async function seedAll() {
    // Three different accounts: the three seed transactions do not depend on each other.
    await Promise.all(ROLES.filter((r) => !seededRoles[r]).map((r) => run(`Seed ${ROLE_LABEL[r]}`, r, "seed", [BigInt(SEED_MICROS)])));
  }

  return (
    <header className={styles.top}>
      <div className={styles.brandRow}>
        <div>
          <h1 className={styles.brand}>Chargeback</h1>
          <p className={styles.thesis}>
            The first verdict is trusted only because a stranger can fund a second one for less than the claim.
          </p>
        </div>
        <div className={styles.meta}>
          <span className="chip">
            <span className={styles.dot} aria-hidden="true" />
            {networkName}
          </span>
          {chainConfig && (
            <a className="chip mono" href={addressUrl(chainConfig.contract)} target="_blank" rel="noreferrer">
              contract {shortAddr(chainConfig.contract)}
            </a>
          )}
          <span className="chip mono" title="The contract's own clock: the transaction timestamp">
            {chainReady && config
              ? `1 tick = ${formatClock(config.tickSeconds)} · window ${config.windowTicks} ticks`
              : "reading chain clock…"}
          </span>
          {chainReady && <span className="chip mono">chain time {new Date(chainNow * 1000).toISOString().slice(11, 19)}Z</span>}
        </div>
      </div>

      <div className={styles.balances} role="group" aria-label="Demo accounts">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            className={`${styles.account} ${active === r ? styles.accountActive : ""}`}
            onClick={() => setActive(r)}
            aria-pressed={active === r}
            title={addresses[r]}
          >
            <span className={styles.accountRole}>{ROLE_LABEL[r]}</span>
            <span className={`mono ${styles.accountBal}`}>
              {balances[r] === undefined ? "…" : formatUsdc(balances[r] ?? 0)}
            </span>
            <span className={`mono ${styles.accountAddr}`}>{shortAddr(addresses[r])}</span>
          </button>
        ))}
        <div className={styles.accountActions}>
          <button type="button" className="btn btnPrimary" onClick={seedAll} disabled={busy || seeded}>
            {seeded ? "Accounts seeded" : "Seed demo accounts"}
          </button>
          <button
            type="button"
            className="btn btnQuiet"
            onClick={resetAccounts}
            disabled={busy}
            title="Generate three fresh throwaway keys in this browser"
          >
            New demo keys
          </button>
        </div>
      </div>
    </header>
  );
}
