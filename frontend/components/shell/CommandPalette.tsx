"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES, ROLE_LABEL } from "../../lib/accounts.ts";
import { useCourt } from "../../lib/court.tsx";
import { search, type SearchItem } from "../../lib/derive.ts";
import { SEED_MICROS } from "../../demo/script.ts";
import { Icon } from "../ui/Icon.tsx";
import { NAV, NAV_FOOT } from "./nav.ts";
import { useShell } from "./ShellContext.tsx";
import s from "./shell.module.css";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { openNewSpend } = useShell();
  const { spends, cases, setActive, run, seededRoles, addresses } = useCourt();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => input.current?.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<SearchItem[]>(() => {
    const out: SearchItem[] = [
      { kind: "Actions", label: "Open a new spend", hint: "Lock funds behind a mandate", action: "new" },
      ...(ROLES.some((r) => !seededRoles[r])
        ? [{ kind: "Actions", label: "Seed demo accounts", hint: "Mint free mock USDC", action: "seed" }]
        : []),
      ...ROLES.map((r) => ({ kind: "Actions", label: `Act as ${ROLE_LABEL[r]}`, hint: "Switch signer", action: `as:${r}` })),
    ];
    for (const g of NAV) for (const n of g.items) out.push({ kind: "Pages", label: n.label, hint: n.href.replace("/console", "") || "/", href: n.href });
    for (const n of NAV_FOOT) out.push({ kind: "Pages", label: n.label, hint: n.href.replace("/console", ""), href: n.href });
    for (const sp of spends ?? []) {
      out.push({ kind: "Disputes", label: `Spend #${sp.id}: ${sp.mandate}`, hint: sp.status, href: `/console/spend/${sp.id}` });
    }
    for (const c of cases ?? []) {
      out.push({ kind: "Rulings", label: `Case #${c.id} ${c.label}: ${c.reason}`, hint: `spend #${c.spendId}`, href: `/console/spend/${c.spendId}` });
    }
    const seen = new Set<string>();
    for (const sp of spends ?? []) {
      if (seen.has(sp.evidenceUrl)) continue;
      seen.add(sp.evidenceUrl);
      out.push({ kind: "Evidence", label: sp.evidenceUrl, hint: `spend #${sp.id}`, href: `/console/spend/${sp.id}` });
    }
    return out;
  }, [spends, cases, seededRoles]);

  const results = useMemo(() => search(items, query, 9), [items, query]);

  function go(item: SearchItem | undefined) {
    if (!item) return;
    onClose();
    if (item.href) router.push(item.href);
    else if (item.action === "new") openNewSpend();
    else if (item.action === "seed") {
      for (const r of ROLES.filter((x) => !seededRoles[x])) void run(`Seed ${ROLE_LABEL[r]}`, r, "seed", [BigInt(SEED_MICROS)]);
    } else if (item.action?.startsWith("as:")) {
      const role = ROLES.find((r) => r === item.action?.slice(3));
      if (role && addresses[role]) setActive(role);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[index]);
    }
  }

  let lastKind = "";
  return (
    <dialog
      ref={ref}
      className={s.palette}
      aria-label="Command palette"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={s.pInput}>
        <Icon name="search" size={18} />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKey}
          placeholder="Search Chargeback…"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[index] ? `pal-${index}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className={s.kbd}>esc</kbd>
      </div>
      <ul id="palette-list" className={s.pList} role="listbox">
        {results.length === 0 && <li className={s.pGroup}>No matches. Try a spend number, a word from a mandate, or a page name.</li>}
        {results.map((item, i) => {
          const header = item.kind !== lastKind ? item.kind : null;
          lastKind = item.kind;
          return (
            <li key={`${item.kind}-${item.label}-${i}`} role="presentation">
              {header && <div className={s.pGroup}>{query === "" && header === "Disputes" ? "Recent" : header}</div>}
              <div
                id={`pal-${i}`}
                role="option"
                aria-selected={i === index}
                className={s.pItem}
                onMouseMove={() => setIndex(i)}
                onClick={() => go(item)}
              >
                <Icon name={item.href ? "arrow" : "sparkle"} size={16} />
                <span className={s.pLabel}>{item.label}</span>
                <span className={s.pHint}>{item.hint}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className={s.pFoot}>
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
    </dialog>
  );
}
