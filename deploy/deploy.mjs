// Deploy ChargebackCourt to GenLayer Studio (Studionet) and write frontend/.env.local.
//
//   cd frontend && npm install && cd ..
//   node deploy/deploy.mjs [--tick-seconds 60] [--rpc https://studio.genlayer.com/api] [--chain-id 61999]
//
// Studionet is gasless, so the throwaway deployer key needs no funds. The contract has no owner,
// so the deployer holds no privileges and its key is not stored anywhere.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "frontend", "package.json"));
const { createClient, createAccount, generatePrivateKey } = await import(
  pathToFileUrl(require.resolve("genlayer-js"))
);
const { studionet, localnet } = await import(pathToFileUrl(require.resolve("genlayer-js/chains")));
const { TransactionStatus } = await import(pathToFileUrl(require.resolve("genlayer-js/types")));

function pathToFileUrl(p) {
  return new URL(`file:///${p.replace(/\\/g, "/")}`).href;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const tickSeconds = Number(arg("tick-seconds", "60"));
const chainId = Number(arg("chain-id", "61999"));
const chain = chainId === 61127 ? localnet : studionet;
const rpc = arg("rpc", chain.rpcUrls.default.http[0]);
const explorer = arg("explorer", "https://explorer-studio.genlayer.com");

if (!Number.isInteger(tickSeconds) || tickSeconds < 1) throw new Error("--tick-seconds must be a positive integer");

const code = readFileSync(join(root, "contracts", "chargeback.py"), "utf8");
const account = createAccount(generatePrivateKey());
const client = createClient({
  chain: { ...chain, rpcUrls: { default: { http: [rpc] } } },
  account,
});

console.log(`Deploying ChargebackCourt (tick = ${tickSeconds}s, window = ${3 * tickSeconds}s) to ${rpc} ...`);
const hash = await client.deployContract({ code, args: [tickSeconds] });
console.log(`deploy tx ${hash}`);
const receipt = await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.ACCEPTED,
  retries: 120,
  interval: 3000,
});
const address = receipt?.data?.contract_address ?? receipt?.txDataDecoded?.contractAddress;
if (!address) {
  console.error(JSON.stringify(receipt, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2).slice(0, 4000));
  throw new Error("deployment receipt carried no contract address");
}
console.log(`ChargebackCourt deployed at ${address}`);
console.log(`explorer: ${explorer}/address/${address}`);

const env = [
  `NEXT_PUBLIC_GENLAYER_RPC_URL=${rpc}`,
  `NEXT_PUBLIC_GENLAYER_CHAIN_ID=${chainId}`,
  `NEXT_PUBLIC_GENLAYER_EXPLORER_URL=${explorer}`,
  `NEXT_PUBLIC_CHARGEBACK_ADDRESS=${address}`,
  "",
].join("\n");
const out = join(root, "frontend", ".env.local");
if (existsSync(out)) console.log(`(replacing ${out})`);
writeFileSync(out, env);
console.log(`wrote ${out}`);
