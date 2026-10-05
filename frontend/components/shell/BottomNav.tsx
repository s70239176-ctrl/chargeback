"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../ui/Icon.tsx";
import { useShell } from "./ShellContext.tsx";
import s from "./shell.module.css";

const ITEMS: Array<{ href: string; label: string; icon: IconName } | "plus"> = [
  { href: "/console", label: "Overview", icon: "overview" },
  { href: "/console/opportunities", label: "Recovery", icon: "recovery" },
  "plus",
  { href: "/console/activity", label: "Activity", icon: "bell" },
  { href: "/console/settings", label: "Profile", icon: "user" },
];

export function BottomNav() {
  const path = usePathname();
  const { openNewSpend } = useShell();
  return (
    <nav className={s.bottom} aria-label="Mobile">
      {ITEMS.map((item) =>
        item === "plus" ? (
          <button key="plus" type="button" className={s.bPlus} onClick={openNewSpend} aria-label="Open a new spend">
            <Icon name="plus" size={22} />
          </button>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`${s.bItem} ${path === item.href ? s.bOn : ""}`}
            aria-current={path === item.href ? "page" : undefined}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
