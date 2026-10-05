"use client";

import { ROLE_LABEL } from "../lib/accounts.ts";
import { useCourt } from "../lib/court.tsx";
import { Busy, TxLink } from "./ui.tsx";
import styles from "./Shell.module.css";

const PHASE_TEXT = {
  signing: "Signing…",
  pending: "Waiting for validators",
  accepted: "Accepted by validators",
  failed: "Failed",
} as const;

export function TxTape() {
  const { txs, dismissTx } = useCourt();
  if (txs.length === 0) return null;
  return (
    <aside className={styles.tape} aria-label="Transactions" aria-live="polite">
      {txs
        .slice()
        .reverse()
        .map((t) => (
          <div key={t.id} className={`${styles.tx} ${t.phase === "failed" ? styles.txFailed : ""}`}>
            <div className={styles.txHead}>
              <span className={styles.txLabel}>
                {t.label} <span className={styles.txRole}>as {ROLE_LABEL[t.role]}</span>
              </span>
              <button type="button" className="btn btnQuiet" onClick={() => dismissTx(t.id)} aria-label="Dismiss">
                ×
              </button>
            </div>
            <div className={styles.txBody}>
              {t.phase === "pending" && t.hash ? (
                <Busy label={`${PHASE_TEXT.pending}${t.detail ? ` · ${t.detail.toLowerCase()}` : ""}`} />
              ) : (
                <span>{PHASE_TEXT[t.phase]}</span>
              )}
              {t.hash && <TxLink hash={t.hash} />}
            </div>
            {t.error && <p className={styles.txError}>{t.error}</p>}
          </div>
        ))}
    </aside>
  );
}
