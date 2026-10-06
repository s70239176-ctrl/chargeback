// Walks the exact reviewer path on a deployed site, in a real browser, and checks the outcome.
//
//   node demo/verify-site.mjs [--url https://chargeback-two.vercel.app] [--shots <dir>]
//
// This is the "How-to" and "Expected outcome" from the project submission, executed. It uses the
// K2 scenario (a fixed Wikipedia page), so the expected ruling does not depend on live data.
import { chromium } from "playwright-core";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const base = arg("url", "https://chargeback-two.vercel.app").replace(/\/+$/, "");
const shots = arg("shots", "");
if (shots) mkdirSync(shots, { recursive: true });

const channel = existsSync("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe") ? "msedge" : "chrome";
const browser = await chromium.launch({ channel, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const page = await context.newPage();
page.setDefaultTimeout(240_000);

const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${m}`);
let failures = 0;
const check = (name, ok, detail = "") => {
  log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const shot = (name) => (shots ? page.screenshot({ path: join(shots, `${name}.png`) }) : Promise.resolve());
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  log(`step 1: open ${base} and click Open console`);
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Open console" }).first().click();
  await page.waitForURL("**/console");

  log("step 2: Seed demo accounts");
  const onboard = page.getByText("Start with the demo accounts.");
  await onboard.waitFor();
  await page.getByRole("button", { name: "Seed demo accounts" }).click();
  await onboard.waitFor({ state: "detached" });
  check("the three accounts were seeded", true);

  log("step 3: Opportunities > New spend > K2 (false claim) > Lock as Payer");
  await page.getByRole("link", { name: /Opportunities/ }).first().click();
  await page.waitForURL("**/console/opportunities");
  await page.getByRole("button", { name: /New spend/ }).click();
  await page.getByRole("radio", { name: /K2/ }).click();
  const lock = page.getByRole("button", { name: /^Lock/ });
  check("the lock button names the amount and bond", /Lock 110 tUSD as Payer/.test(await lock.innerText()), await lock.innerText());
  await lock.click();
  await page.waitForURL("**/console/opportunities");
  await page.locator("tbody tr").first().waitFor();
  const openedAt = Date.now();
  check("the new spend appears as provisional", /Provisional/i.test(await page.locator("tbody tr").first().innerText()));
  await shot("1-opportunities");

  log("step 4: open the spend; try a challenge as Payer first, then as Stranger");
  await page.locator("tbody tr").first().click();
  await page.waitForURL("**/console/spend/**");
  await page.getByRole("radio", { name: "Payer" }).click();
  await page.getByRole("button", { name: /bond and challenge/ }).click();
  await page.getByText(/a party to the spend cannot challenge it; only a stranger can/).first().waitFor();
  check("the payer is refused with the contract's own reason", true);
  await page.getByRole("radio", { name: "Recipient" }).click();
  await page.getByRole("button", { name: /bond and challenge/ }).click();
  await page.waitForTimeout(400);
  await page.getByText(/a party to the spend cannot challenge it/).first().waitFor();
  check("the recipient is refused too", true);
  await page.getByRole("radio", { name: "Stranger" }).click();
  const challenge = page.getByRole("button", { name: /Post 10 tUSD bond and challenge/ });
  await challenge.waitFor();
  const claim = await page.locator("#actions textarea").inputValue();
  check("the stranger's claim is prefilled", claim.length > 20, claim.slice(0, 60));
  log(`  (${Math.round((Date.now() - openedAt) / 1000)}s into the 180s challenge window)`);
  await challenge.click();

  log("step 5: Convene the panel and wait for real validators");
  const convene = page.getByRole("button", { name: "Convene the panel" });
  await convene.waitFor();
  await shot("2-before-ruling");
  await convene.click();
  await page.getByText("Challenge upheld").first().waitFor();
  await shot("3-ruling");

  log("step 6: read the ruling, the quote and the ledger");
  const body = await page.locator("main").innerText();
  check("ruling is MISMATCH", /MISMATCH/.test(body));
  check("status is Reverted and recovered", /Reverted and recovered/.test(body));
  check("the page shows a quote from the Everest page", /Everest/i.test(body) && /highest/i.test(body));
  const ledger = await page.locator("table").last().innerText();
  const norm = ledger.replace(/\s+/g, " ");
  check("ledger: Payer +100 tUSD", /Payer \+100 tUSD/.test(norm), norm.slice(0, 160));
  check("ledger: Stranger +10 tUSD twice (bond slashed, own bond returned)", (norm.match(/Stranger \+10 tUSD/g) ?? []).length === 2);
  check("the recipient received nothing", !/Recipient \+/.test(norm));
  check("no uncaught page errors", errors.length === 0, errors.join(" | ").slice(0, 200));
} catch (e) {
  failures += 1;
  log(`  FAIL ${String(e).split("\n")[0]}`);
  await shot("failure").catch(() => {});
} finally {
  await browser.close();
}
console.log(failures === 0 ? "SITE PATH VERIFIED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
