"use client";

import Link from "next/link";
import { addressUrl, chainConfig, networkName } from "../../lib/config.ts";
import { useCourt } from "../../lib/court.tsx";
import { nextActions } from "../../lib/derive.ts";
import { shortAddr } from "../../lib/money.ts";
import { Badge } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useShell } from "./ShellContext.tsx";
import s from "./shell.module.css";

export function TopBar() {
  const { openPalette } = useShell();
  const { spends, addresses, chainNow, config, active, walletConnected } = useCourt();
  const pending = spends && config ? nextActions(spends, addresses, chainNow, config.tickSeconds).length : 0;

  return (
    <header className={s.topbar}>
      <button type="button" className={s.search} onClick={openPalette} aria-label="Search, or press Command K">
        <Icon name="search" size={16} />
        <span className={s.searchText}>Search anything…</span>
        <kbd className={s.kbd}>⌘ K</kbd>
      </button>
      <div className={s.topRight}>
        <span className={s.hideMobile}>
          <Badge tone="info">{networkName}</Badge>
        </span>
        {chainConfig && (
          <a
            className={`${s.hideMobile} mono`}
            href={addressUrl(chainConfig.contract)}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--text-3)", fontSize: 12 }}
          >
            {shortAddr(chainConfig.contract)}
          </a>
        )}
        <Link href="/console/settings#wallet" className={`${s.hideMobile}`} style={{ textDecoration: "none" }}>
          <Badge tone={walletConnected ? "positive" : "neutral"}>{walletConnected ? "Wallet connected" : "Connect wallet"}</Badge>
        </Link>
        <Link href="/console/activity" className={`${s.item} ${s.bell}`} style={{ width: 36, padding: 0, justifyContent: "center" }} aria-label={`Notifications${pending ? `, ${pending} need attention` : ""}`}>
          <Icon name="bell" />
          {pending > 0 && <span className={s.bellDot}>{pending > 9 ? "9+" : pending}</span>}
        </Link>
        <Link href="/console/help" className={`${s.item} ${s.hideMobile}`} style={{ width: 36, padding: 0, justifyContent: "center" }} aria-label="Help">
          <Icon name="help" />
        </Link>
        <Link href="/console/settings" className={s.avatar} aria-label="Account settings" style={{ textDecoration: "none" }}>
          {active.slice(0, 2).toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
