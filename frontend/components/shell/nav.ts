import type { IconName } from "../ui/Icon.tsx";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Which spend view's count to show next to the label. */
  count?: "opportunities" | "disputes" | "won" | "lost";
}

export const NAV: ReadonlyArray<{ group: string | null; items: NavItem[] }> = [
  { group: null, items: [{ href: "/console", label: "Overview", icon: "overview" }] },
  {
    group: "Recovery",
    items: [
      { href: "/console/opportunities", label: "Opportunities", icon: "recovery", count: "opportunities" },
      { href: "/console/disputes", label: "Active disputes", icon: "active", count: "disputes" },
      { href: "/console/won", label: "Won", icon: "won", count: "won" },
      { href: "/console/lost", label: "Lost", icon: "lost", count: "lost" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/console/analysis", label: "AI Analysis", icon: "intel" },
      { href: "/console/signals", label: "Risk Signals", icon: "shield" },
      { href: "/console/evidence", label: "Evidence", icon: "doc" },
    ],
  },
  {
    group: null,
    items: [
      { href: "/console/transactions", label: "Transactions", icon: "tx" },
      { href: "/console/analytics", label: "Analytics", icon: "analytics" },
    ],
  },
];

export const NAV_FOOT: NavItem[] = [
  { href: "/console/settings", label: "Settings", icon: "settings" },
  { href: "/console/help", label: "Help", icon: "help" },
];
