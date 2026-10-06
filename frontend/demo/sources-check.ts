/**
 * Runs each live scenario against real validator consensus and compares the ruling with what the
 * source itself says at that moment. The expectation is computed here, from the same URL, so the
 * test stays true as the sources change.
 *
 *   cd frontend && npm run sources -- [release] [filing] [flights] [github]
 */
import { createChainApi, freshPrivateKey } from "../lib/chain.ts";
import { describeError } from "../lib/errors.ts";
import { AMOUNT_MICROS, SCENARIOS, SEED_MICROS, type Scenario } from "./script.ts";

const contract = process.env.NEXT_PUBLIC_CHARGEBACK_ADDRESS as `0x${string}`;
const api = createChainApi({
  rpcUrl: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api",
  chainId: Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999"),
  contract,
});
const payer = api.signer(freshPrivateKey());
const stranger = api.signer(freshPrivateKey());
const recipient = api.signer(freshPrivateKey());
const t0 = Date.now();
const log = (m: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${m}`);

type Key = "release" | "filing" | "flights" | "github";

/** What an honest panel must say, derived from the live source. */
const EXPECT: Record<Key, (body: string) => { label: "MATCH" | "MISMATCH"; why: string }> = {
  release: (body) => {
    const titles = [...body.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1] ?? "");
    const final = titles.some((t) => /^Release v0\.3\.0$/.test(t.trim()));
    return { label: final ? "MATCH" : "MISMATCH", why: `newest titles: ${titles.slice(1, 4).join(" | ")}` };
  },
  filing: (body) => {
    const j = JSON.parse(body) as { results: Array<{ agencies?: Array<{ name?: string }>; title?: string }> };
    const agencies = (j.results[0]?.agencies ?? []).map((a) => a.name ?? "");
    const epa = agencies.some((a) => /Environmental Protection Agency/i.test(a));
    return { label: epa ? "MATCH" : "MISMATCH", why: `newest final rule by ${agencies.join(", ") || "?"}` };
  },
  flights: (body) => {
    const stop = /Ground_Stop|Ground Stop/i.test(body);
    return { label: stop ? "MATCH" : "MISMATCH", why: stop ? "a ground stop is listed" : "no ground stop listed" };
  },
  github: (body) => {
    const none = (JSON.parse(body) as { status?: { indicator?: string } }).status?.indicator === "none";
    return { label: none ? "MISMATCH" : "MATCH", why: `indicator ${none ? "none" : "not none"}` };
  },
};

async function run(key: Key): Promise<boolean> {
  const sc: Scenario = SCENARIOS[key];
  const url = sc.evidenceUrl ?? "";
  const body = await (await fetch(url)).text();
  const want = EXPECT[key](body);
  log(`${key}: source says -> an honest panel rules ${want.label} (${want.why})`);
  await payer.send("open_spend", [recipient.address, BigInt(AMOUNT_MICROS), sc.mandate, url, sc.trace]);
  const spend = (await api.reads.spends()).find((s) => s.payer.toLowerCase() === payer.address.toLowerCase() && s.mandate === sc.mandate && s.status === "open");
  if (!spend) throw new Error("spend not found");
  await stranger.send("challenge", [BigInt(spend.id), sc.claim, url, 0n]);
  const challengeId = (await api.reads.spend(spend.id)).activeChallengeId;
  await stranger.send("rule", [BigInt(challengeId)]);
  const done = await api.reads.spend(spend.id);
  const got = done.challenge?.verdictLabel;
  log(`  ruling ${got}: ${done.challenge?.verdictReason}`);
  log(`  quote "${done.challenge?.evidenceQuote?.slice(0, 160)}"`);
  const ok = got === want.label;
  log(`  ${ok ? "ok  " : "FAIL"} ${key}: panel ${ok ? "agrees" : "disagrees"} with the live source`);
  return ok;
}

const wanted = process.argv.slice(2).filter((k): k is Key => k in EXPECT);
const keys: Key[] = wanted.length ? wanted : ["release", "filing", "flights"];
let failed = 0;
try {
  await Promise.all([payer, stranger].map((s) => s.send("seed", [BigInt(SEED_MICROS)])));
  for (const k of keys) if (!(await run(k))) failed += 1;
} catch (e) {
  console.error(describeError(e));
  failed += 1;
}
log(failed === 0 ? "ALL SOURCES OK" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
