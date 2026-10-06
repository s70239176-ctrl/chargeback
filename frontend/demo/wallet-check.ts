/**
 * Proves the wallet path end to end without a browser extension.
 *
 * It builds a minimal EIP-1193 provider (what MetaMask exposes as window.ethereum) backed by a local
 * key, hands it to the same `walletSigner` the app uses for a connected wallet, and runs real
 * transactions on the network: signing and sending go through the provider, reads go to the RPC.
 *
 *   cd frontend && node --env-file=.env.local --experimental-strip-types demo/wallet-check.ts
 */
import { createWalletClient, http } from "viem";
import { createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { createChainApi } from "../lib/chain.ts";
import { describeError } from "../lib/errors.ts";
import { connectWallet, type Eip1193, type WalletNetwork } from "../lib/wallet.ts";

const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
const contract = process.env.NEXT_PUBLIC_CHARGEBACK_ADDRESS as `0x${string}`;
const net: WalletNetwork = { chainId: 61999, rpcUrl, name: "GenLayer Studionet", symbol: "GEN", explorer: "https://explorer-studio.genlayer.com" };

const account = createAccount(generatePrivateKey());
const wallet = createWalletClient({ account, chain: studionet, transport: http(rpcUrl) });
const calls: string[] = [];

// The same surface a browser wallet exposes. Only signing/sending are answered here; the app must
// not route reads through it.
const provider: Eip1193 = {
  async request({ method, params }) {
    calls.push(method);
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return `0x${net.chainId.toString(16)}`;
      case "wallet_switchEthereumChain":
        return null;
      case "eth_sendTransaction": {
        const [tx] = params as [{ to: `0x${string}`; data: `0x${string}`; value?: `0x${string}`; gas?: `0x${string}` }];
        return wallet.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
        });
      }
      default:
        throw new Error(`the wallet should not be asked for ${method}`);
    }
  },
};

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};

const address = await connectWallet(provider, net);
check("connectWallet returns the wallet's account", address.toLowerCase() === account.address.toLowerCase());

const api = createChainApi({ rpcUrl, chainId: 61999, contract });
const signer = api.walletSigner(provider, address);
check("the signer is bound to the wallet's address", signer.address.toLowerCase() === address.toLowerCase());

try {
  await signer.send("seed", [500_000_000n]);
  const bal = await api.reads.balance(address);
  check("a transaction signed by the wallet was accepted and credited the wallet's own address", bal === 500_000_000, `balance ${bal}`);
} catch (e) {
  check("a transaction signed by the wallet was accepted", false, describeError(e));
}

try {
  await signer.send("seed", [1n]);
  check("a refused transaction surfaces the contract's reason", false, "second seed succeeded");
} catch (e) {
  check("a refused transaction surfaces the contract's reason", /already been seeded/.test(describeError(e)), describeError(e));
}

check("the wallet was asked to send transactions", calls.includes("eth_sendTransaction"));
check("reads never went through the wallet", !calls.some((m) => /^(eth_call|gen_call|eth_getBlock|eth_getTransactionByHash)/.test(m)), calls.join(","));
console.log(failures === 0 ? "WALLET PATH OK" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
