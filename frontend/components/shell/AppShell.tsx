"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BottomNav } from "./BottomNav.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { NewSpendDrawer } from "./NewSpendDrawer.tsx";
import { ShellCtx, type ShellApi } from "./ShellContext.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { Toasts } from "./Toasts.tsx";
import { TopBar } from "./TopBar.tsx";
import s from "./shell.module.css";

const KEY = "chargeback.sidebar.v1";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [newSpend, setNewSpend] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  }, []);

  const api = useMemo<ShellApi>(
    () => ({ openPalette: () => setPalette(true), openNewSpend: () => setNewSpend(true), collapsed, toggleCollapsed }),
    [collapsed, toggleCollapsed],
  );

  return (
    <ShellCtx.Provider value={api}>
      <div className={`${s.shell} ${collapsed ? s.collapsed : ""}`}>
        <Sidebar />
        <div className={s.main}>
          <TopBar />
          <main id="main" className={s.page}>
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
      <Toasts />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <NewSpendDrawer open={newSpend} onClose={() => setNewSpend(false)} />
    </ShellCtx.Provider>
  );
}
