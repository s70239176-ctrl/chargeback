/**
 * Bring-your-own wallet: any EIP-1193 provider (MetaMask, Rabby, Coinbase Wallet, ...). The wallet
 * signs and sends; reads still go straight to the GenLayer RPC. This file only handles connecting
 * and getting the wallet onto the right network.
 */
export interface Eip1193 {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface WalletNetwork {
  chainId: number;
  rpcUrl: string;
  name: string;
  symbol: string;
  explorer: string;
}

export function injectedProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const p = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return p && typeof p.request === "function" ? p : null;
}

const hex = (n: number) => `0x${n.toString(16)}`;

function code(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const c = (error as { code: unknown }).code;
    return typeof c === "number" ? c : undefined;
  }
  return undefined;
}

/** Switch the wallet to the court's network, adding it first if the wallet has never seen it. */
export async function ensureNetwork(provider: Eip1193, net: WalletNetwork): Promise<void> {
  const current = await provider.request({ method: "eth_chainId" });
  if (typeof current === "string" && parseInt(current, 16) === net.chainId) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex(net.chainId) }] });
  } catch (e) {
    // 4902 is the standard "unknown chain"; some wallets answer -32603 for the same thing.
    if (code(e) !== 4902 && code(e) !== -32603) throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex(net.chainId),
          chainName: net.name,
          nativeCurrency: { name: net.symbol, symbol: net.symbol, decimals: 18 },
          rpcUrls: [net.rpcUrl],
          blockExplorerUrls: [net.explorer],
        },
      ],
    });
  }
}

function firstAccount(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" && /^0x[0-9a-fA-F]{40}$/.test(value[0]) ? value[0] : null;
}

/** Ask the wallet for an account (this prompts the user), then make sure it is on the right network. */
export async function connectWallet(provider: Eip1193, net: WalletNetwork): Promise<string> {
  const address = firstAccount(await provider.request({ method: "eth_requestAccounts" }));
  if (!address) throw new Error("The wallet did not share an account.");
  await ensureNetwork(provider, net);
  return address;
}

/** An account the user already approved for this site, without prompting. */
export async function approvedAccount(provider: Eip1193): Promise<string | null> {
  try {
    return firstAccount(await provider.request({ method: "eth_accounts" }));
  } catch {
    return null;
  }
}

export function describeWalletError(error: unknown): string {
  if (code(error) === 4001) return "You closed the wallet prompt, so nothing was connected.";
  if (code(error) === -32002) return "The wallet already has a request open. Check its window.";
  if (error instanceof Error) return error.message.split("\n")[0] ?? error.message;
  return "The wallet could not be reached.";
}
