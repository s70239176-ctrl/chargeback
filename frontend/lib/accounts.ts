import { addressOf, freshPrivateKey } from "./chain.ts";
import type { Role } from "./types.ts";

export const ROLES: readonly Role[] = ["payer", "recipient", "stranger"];

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  payer: "Payer",
  recipient: "Recipient",
  stranger: "Stranger",
};

const STORAGE_KEY = "chargeback.demo-accounts.v1";

export type Keys = Record<Role, string>;

function isKeys(value: unknown): value is Keys {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return ROLES.every((r) => typeof o[r] === "string" && /^0x[0-9a-fA-F]{64}$/.test(o[r] as string));
}

/**
 * Throwaway keys for a gasless hosted dev network, generated in this browser and kept in
 * localStorage. They hold mock USDC only; nothing is ever committed or sent anywhere.
 */
export function loadOrCreateKeys(): Keys {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isKeys(parsed)) return parsed;
    }
  } catch {
    /* private mode or corrupt value: fall through and mint new keys */
  }
  const keys: Keys = {
    payer: freshPrivateKey(),
    recipient: freshPrivateKey(),
    stranger: freshPrivateKey(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* the keys still work for this page load */
  }
  return keys;
}

export function resetKeys(): Keys {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return loadOrCreateKeys();
}

export function addressesOf(keys: Keys): Record<Role, string> {
  return {
    payer: addressOf(keys.payer),
    recipient: addressOf(keys.recipient),
    stranger: addressOf(keys.stranger),
  };
}

export function roleOfAddress(addresses: Readonly<Record<Role, string>>, address: string): Role | null {
  const a = address.toLowerCase();
  return ROLES.find((r) => addresses[r].toLowerCase() === a) ?? null;
}
