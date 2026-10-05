"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLES, ROLE_LABEL } from "../../lib/accounts.ts";
import { useCourt } from "../../lib/court.tsx";
import { shortAddr, usd } from "../../lib/money.ts";
import { VIEW_META, inView, type View } from "../../lib/views.ts";
import { Icon } from "../ui/Icon.tsx";
import { NAV, NAV_FOOT } from "./nav.ts";
import { useShell } from "./ShellContext.tsx";
import s from "./shell.module.css";

export function Sidebar() {
  const path = usePathname();
  const { spends, chainNow, active, setActive, addresses, balances } = useCourt();
  const { collapsed, toggleCollapsed } = useShell();

  const counts = (view: View) => (spends ?? []).filter((x) => inView(view, x, chainNow)).length;
  const on = (href: string) => (href === "/console" ? path === href : path === href || path.startsWith(`${href}/`));

  return (
    <aside className={s.sidebar} aria-label="Primary">
      <Link href="/" className={s.brand} aria-label="Chargeback home">
        <span className={s.mark} aria-hidden="true" />
        <span className={s.brandText}>CHARGEBACK</span>
      </Link>

      <nav className={s.nav} aria-label="Console">
        {NAV.map((g, gi) => (
          <div key={gi} className={s.nav}>
            {g.group && <p className={s.group}>{g.group}</p>}
            {g.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${s.item} ${on(item.href) ? s.itemOn : ""}`}
                aria-current={on(item.href) ? "page" : undefined}
                title={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} />
                <span className={s.label}>{item.label}</span>
                {item.count && spends !== undefined && <span className={s.itemCount}>{counts(item.count)}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className={s.spacer} />

      <nav className={s.nav} aria-label="Support">
        {NAV_FOOT.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${s.item} ${on(item.href) ? s.itemOn : ""}`}
            aria-current={on(item.href) ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span className={s.label}>{item.label}</span>
          </Link>
        ))}
        <button type="button" className={`${s.item} ${s.collapseBtn}`} onClick={toggleCollapsed} aria-pressed={collapsed} style={{ background: "none", border: 0, cursor: "pointer", width: "100%" }}>
          <Icon name="sidebar" />
          <span className={s.label}>{collapsed ? "Expand" : "Collapse"}</span>
        </button>
      </nav>

      <div className={s.profile}>
        <div className={s.profileRow}>
          <span className={s.avatar} aria-hidden="true">
            {ROLE_LABEL[active].slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div className={s.profileName}>{ROLE_LABEL[active]}</div>
            <div className={s.profileSub}>
              {addresses[active] ? shortAddr(addresses[active]) : "…"}
              {balances[active] !== undefined ? ` · ${usd(balances[active] ?? 0)}` : ""}
            </div>
          </div>
        </div>
        <div className={s.roles} role="radiogroup" aria-label="Act as">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={active === r}
              className={`${s.role} ${active === r ? s.roleOn : ""}`}
              onClick={() => setActive(r)}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export { VIEW_META };
