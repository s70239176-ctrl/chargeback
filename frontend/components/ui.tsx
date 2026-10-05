"use client";

import { roleOfAddress, ROLE_LABEL } from "../lib/accounts.ts";
import { txUrl } from "../lib/config.ts";
import { shortAddr } from "../lib/money.ts";
import type { Role, SpendStatus } from "../lib/types.ts";

/** "Payer", "Stranger", or a short address when it is not one of the demo accounts. */
export function WhoName({ addresses, address }: { addresses: Readonly<Record<Role, string>>; address: string }) {
  const role = roleOfAddress(addresses, address);
  return (
    <span title={address}>
      {role ? ROLE_LABEL[role] : <span className="mono">{shortAddr(address)}</span>}
    </span>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a className="mono" href={txUrl(hash)} target="_blank" rel="noreferrer" title={hash}>
      {hash.slice(0, 10)}…{hash.slice(-4)}
    </a>
  );
}

const STATUS_COPY: Record<SpendStatus, { text: string; cls: string }> = {
  open: { text: "provisional", cls: "chip chipAccent" },
  challenged: { text: "second look funded", cls: "chip chipStrong" },
  cleared: { text: "challenge failed · appealable", cls: "chip" },
  final: { text: "final", cls: "chip" },
  reverted: { text: "reverted", cls: "chip chipStrong" },
};

export function StatusChip({ status, windowClosed = false }: { status: SpendStatus; windowClosed?: boolean }) {
  const s = status === "open" && windowClosed ? { text: "unchallenged", cls: "chip" } : STATUS_COPY[status];
  return <span className={s.cls}>{s.text}</span>;
}

export function Busy({ label }: { label: string }) {
  return (
    <>
      <span className="spinner" aria-hidden="true" />
      {label}
    </>
  );
}
