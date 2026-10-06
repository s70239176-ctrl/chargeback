import type { Address, ChainConfig } from "./chain.ts";

// Next only inlines NEXT_PUBLIC_* when they are referenced literally, so each one is spelled out.
const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
const chainId = Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999");
const explorer = (process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL || "https://explorer-studio.genlayer.com").replace(
  /\/+$/,
  "",
);
const contract = process.env.NEXT_PUBLIC_CHARGEBACK_ADDRESS || "";
const fixtureBase = (process.env.NEXT_PUBLIC_FIXTURE_BASE_URL || "").replace(/\/+$/, "");

export const NETWORK_NAMES: Readonly<Record<number, string>> = {
  61999: "Studionet",
  61127: "Localnet",
  4221: "Testnet Bradbury",
};

export const networkName = NETWORK_NAMES[chainId] ?? `chain ${chainId}`;
export const defaultFixtureBase = fixtureBase;

export const chainConfig: ChainConfig | null = /^0x[0-9a-fA-F]{40}$/.test(contract)
  ? { rpcUrl, chainId, contract: contract as Address }
  : null;

export function txUrl(hash: string): string {
  return `${explorer}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${explorer}/address/${address}`;
}

/** Studio's validators fetch evidence from their own network, so loopback hosts can never work. */
export function isPrivateHost(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local");
  } catch {
    return true;
  }
}

export const explorerUrl = explorer;
