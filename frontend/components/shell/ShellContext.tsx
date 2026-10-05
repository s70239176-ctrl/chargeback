"use client";

import { createContext, useContext } from "react";

export interface ShellApi {
  openPalette: () => void;
  openNewSpend: () => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
}

export const ShellCtx = createContext<ShellApi>({
  openPalette: () => undefined,
  openNewSpend: () => undefined,
  collapsed: false,
  toggleCollapsed: () => undefined,
});

export const useShell = () => useContext(ShellCtx);
