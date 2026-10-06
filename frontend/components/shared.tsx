"use client";

import { roleOfAddress, ROLE_LABEL } from "../lib/accounts.ts";
import { txUrl } from "../lib/config.ts";
import { shortAddr } from "../lib/money.ts";
import type { Identity } from "../lib/types.ts";

/** "Payer", "Stranger", or a short address when it is not one of this browser's demo accounts. */
export function WhoName({ addresses, address }: { addresses: Readonly<Record<Identity, string>>; address: string }) {
  const role = roleOfAddress(addresses, address);
  return (
    <span title={address}>{role ? ROLE_LABEL[role] : <span className="mono">{shortAddr(address)}</span>}</span>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a className="mono" href={txUrl(hash)} target="_blank" rel="noreferrer" title={hash}>
      {hash.slice(0, 10)}…{hash.slice(-4)}
    </a>
  );
}
