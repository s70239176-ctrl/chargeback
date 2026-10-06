"use client";

import { useEffect, useState } from "react";
import { ROLE_LABEL } from "../../lib/accounts.ts";
import { txUrl } from "../../lib/config.ts";
import { useCourt, type TxEntry } from "../../lib/court.tsx";
import { shortAddr } from "../../lib/money.ts";
import { Button } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import s from "./shell.module.css";

const DONE_LABEL: Partial<Record<TxEntry["fn"], string>> = {
  seed: "Test funds minted",
  open_spend: "Spend locked behind its mandate",
  challenge: "Second look funded",
  rule: "Ruling recorded",
  appeal: "Appeal filed",
  rule_appeal: "Appeal ruling recorded",
  accept_ruling: "Ruling accepted, payout released",
  finalize: "Payment released",
};

/** Transactions as quiet toasts: progress while validators work, a line when done, the revert text if refused. */
export function Toasts() {
  const { txs, dismissTx } = useCourt();
  const [gone, setGone] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    const timers = txs
      .filter((t) => t.phase === "accepted" && !gone.has(t.id))
      .map((t) => setTimeout(() => setGone((g) => new Set(g).add(t.id)), 6000));
    return () => timers.forEach(clearTimeout);
  }, [txs, gone]);

  const visible = txs.filter((t) => !gone.has(t.id)).slice(-4);
  if (visible.length === 0) return null;

  return (
    <div className={s.toasts} role="region" aria-label="Notifications" aria-live="polite">
      {visible.map((t) => (
        <div key={t.id} className={`${s.toast} ${t.phase === "failed" ? s.toastErr : ""}`}>
          <span className={s.toastIcon}>
            {t.phase === "failed" ? (
              <Icon name="close" size={16} />
            ) : t.phase === "accepted" ? (
              <span style={{ color: "var(--positive)" }}>
                <Icon name="check" size={16} />
              </span>
            ) : t.hash ? (
              <span className={s.spin} aria-hidden="true" />
            ) : (
              <Icon name="clock" size={16} />
            )}
          </span>
          <div className={s.toastBody}>
            <p className={s.toastTitle}>{t.phase === "accepted" ? (DONE_LABEL[t.fn] ?? t.label) : t.label}</p>
            <p className={s.toastSub}>
              {t.phase === "failed" && t.error}
              {t.phase === "signing" && `Signing as ${ROLE_LABEL[t.role]}…`}
              {t.phase === "pending" && `Validators are working${t.detail ? ` · ${t.detail.toLowerCase()}` : ""}`}
              {t.phase === "accepted" && `As ${ROLE_LABEL[t.role]}`}
              {t.hash && (
                <>
                  {" "}
                  <a href={txUrl(t.hash)} target="_blank" rel="noreferrer">
                    {shortAddr(t.hash)}
                  </a>
                </>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="close"
            aria-label="Dismiss"
            onClick={() => (t.phase === "failed" || t.phase === "accepted" ? dismissTx(t.id) : setGone((g) => new Set(g).add(t.id)))}
          />
        </div>
      ))}
    </div>
  );
}
