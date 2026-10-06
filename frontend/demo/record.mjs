// Records the product demo video: a real browser driving the real app against the real contract
// and real validators. Nothing is staged; the waits you see are the validators working.
//
//   cd frontend && npm run build && npx next start -p 3100   (in another terminal)
//   node demo/record.mjs [--url http://localhost:3100] [--out ../docs/demo]
//
// Needs Microsoft Edge or Google Chrome installed (playwright-core drives the system browser).
import { chromium } from "playwright-core";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const base = arg("url", "http://localhost:3100").replace(/\/+$/, "");
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, arg("out", "../../docs/demo"));
mkdirSync(outDir, { recursive: true });
const tmp = join(outDir, "_raw");
mkdirSync(tmp, { recursive: true });

const SIZE = { width: 1280, height: 720 };
const channel = existsSync("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe") ? "msedge" : "chrome";
const browser = await chromium.launch({ channel, headless: true });
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmp, size: SIZE }, colorScheme: "dark" });

// A visible cursor and a caption bar, injected into every page. The captions are the narration.
await context.addInitScript(() => {
  const boot = () => {
    if (document.getElementById("__cap")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__cur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-4px 0 0 -4px;border-radius:50%;
        border:2px solid #fff;background:rgba(255,255,255,.18);pointer-events:none;transition:transform .08s;box-shadow:0 0 0 1px rgba(0,0,0,.5)}
      #__cur.down{transform:scale(.7);background:rgba(255,255,255,.5)}
      #__cap{position:fixed;z-index:2147483646;left:50%;bottom:34px;transform:translateX(-50%);max-width:980px;
        padding:14px 22px;border-radius:12px;background:rgba(7,9,13,.92);border:1px solid rgba(255,255,255,.16);
        color:#f5f7fa;font:500 22px/1.35 "Geist","Segoe UI",system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .35s;pointer-events:none;
        box-shadow:0 12px 40px rgba(0,0,0,.55)}
      #__cap small{display:block;margin-top:4px;font-size:15px;font-weight:400;color:#8e98a7}
      #__cap.on{opacity:1}`;
    document.head.appendChild(style);
    const cap = document.createElement("div");
    cap.id = "__cap";
    document.body.appendChild(cap);
    const cur = document.createElement("div");
    cur.id = "__cur";
    cur.style.left = "-40px";
    document.body.appendChild(cur);
    document.addEventListener("mousemove", (e) => {
      cur.style.left = `${e.clientX}px`;
      cur.style.top = `${e.clientY}px`;
    }, true);
    document.addEventListener("mousedown", () => cur.classList.add("down"), true);
    document.addEventListener("mouseup", () => cur.classList.remove("down"), true);
    window.__cap = (text, sub) => {
      cap.innerHTML = text ? `${text}${sub ? `<small>${sub}</small>` : ""}` : "";
      cap.classList.toggle("on", Boolean(text));
    };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
});

const page = await context.newPage();
page.setDefaultTimeout(180_000);
const pause = (ms) => page.waitForTimeout(ms);
const say = async (text, sub, hold = 3500) => {
  await page.evaluate(([t, s]) => window.__cap?.(t, s), [text, sub]).catch(() => {});
  await pause(hold);
};
const hush = () => page.evaluate(() => window.__cap?.("")).catch(() => {});

/** A scroll tween that works in headless mode, where native smooth scrolling does not animate. */
async function glide(selector) {
  await page.evaluate(
    ([sel]) =>
      new Promise((resolve) => {
        const target = sel ? (document.querySelector(sel)?.getBoundingClientRect().top ?? 0) + window.scrollY - 12 : 0;
        const from = window.scrollY;
        const start = performance.now();
        const step = (t) => {
          const p = Math.min(1, (t - start) / 1100);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          window.scrollTo(0, from + (target - from) * e);
          if (p < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    [selector],
  );
}

/** Move the cursor to an element like a person would, then click it. */
async function click(locator, { settle = 350 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await pause(settle);
  await locator.click();
}

try {
  // ------------------------------------------------------------------ 1. the idea
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await pause(1200);
  await say("Chargeback", "A standing veto on agent spend", 3200);
  await say("An AI agent is about to spend money.", "Anyone who isn't a party can force a second look, for less than the claim.", 4200);
  await glide("#radar");
  await say("Every spend is a node on the Recovery Radar.", "Closer to the middle means closer to a decision. Bigger means more money.", 4800);
  await glide("#trust");
  await say("No admin key. No operator. The label comes from validator consensus.", undefined, 4200);
  await glide(null);
  await pause(800);

  // ------------------------------------------------------------------ 2. the console
  await hush();
  await click(page.getByRole("link", { name: "Open console" }).first());
  await page.waitForURL("**/console");
  await pause(2500);
  await say("The console reads the live contract on GenLayer Studionet.", "Every number on this screen comes from chain state.", 4200);

  const onboard = page.getByText("Start with the demo accounts.");
  if (await onboard.isVisible().catch(() => false)) {
    await say("Three demo accounts: a payer, a recipient and a stranger.", "Free test funds, minted by the contract.", 3000);
    await click(page.getByRole("button", { name: "Seed demo accounts" }));
    await say("Three real transactions, signed in the browser.", "Validators accept each one.", 2500);
    await onboard.waitFor({ state: "detached" });
    await pause(1500);
  }
  await hush();

  // ------------------------------------------------------------------ 3. the agent's spend
  await click(page.getByRole("link", { name: /Opportunities/ }).first());
  await page.waitForURL("**/console/opportunities");
  await pause(1200);
  await click(page.getByRole("button", { name: /New spend/ }));
  await pause(900);
  await click(page.getByRole("radio", { name: /GenVM release/ }));
  await say(
    "The agent claims GenVM v0.3.0 shipped, and pays a bounty.",
    "Its mandate and its evidence are the real GitHub releases feed, nothing staged.",
    5200,
  );
  await click(page.getByRole("button", { name: /^Lock/ }));
  await say("Instead of paying outright, the agent locks the amount plus a bond.", "Nothing reaches the recipient yet.", 3000);
  await page.waitForURL("**/console/opportunities", { timeout: 120_000 });
  await page.locator("tbody tr").first().waitFor();
  await hush();
  await say("A provisional spend with a live challenge window.", undefined, 3200);

  // ------------------------------------------------------------------ 4. the stranger
  await click(page.locator("tbody tr").first());
  await page.waitForURL("**/console/spend/**");
  await pause(1800);
  await say("Open the spend. Here is the mandate, the timeline and the evidence.", undefined, 3800);
  await page.locator("#actions").scrollIntoViewIfNeeded();
  await say("Acting as a stranger, who is not the payer or the recipient.", "The claim is prefilled from what the feed actually shows.", 4200);
  await click(page.getByRole("button", { name: /bond and challenge/ }));
  await say("A second look is funded with an equal bond.", "Win and you collect both. Lose and yours is slashed.", 3500);
  const convene = page.getByRole("button", { name: "Convene the panel" });
  await convene.waitFor();
  await hush();

  // ------------------------------------------------------------------ 5. the panel
  await click(convene);
  await say(
    "Now the validators work.",
    "Each one fetches the releases feed for itself and rules independently. The call takes no verdict argument.",
    6500,
  );
  await say("This wait is real: consensus on a language-model ruling.", undefined, 1000);
  await page.getByText("Challenge upheld").first().waitFor({ timeout: 240_000 });
  await hush();
  await page.evaluate(() => document.querySelector("h2")?.scrollIntoView());
  await pause(500);
  const analysis = page.getByRole("heading", { name: /Panel analysis/i });
  await analysis.scrollIntoViewIfNeeded();
  await say("MISMATCH. The feed lists only release candidates, never a final v0.3.0.", "The ruling quotes the page word for word, and the contract verifies the quote.", 6500);
  await glide(null);
  await pause(800);
  await say("The spend reverted. The bounty went back to the payer.", "The stranger collected both bonds.", 4500);
  await page.getByText("Who got what").scrollIntoViewIfNeeded();
  await say("Every unit is accounted for, and says why it moved.", undefined, 4200);

  // ------------------------------------------------------------------ 6. the rest of the product
  await page.keyboard.press("Control+k");
  await pause(700);
  await page.keyboard.type("rulings", { delay: 120 });
  await say("Command palette: search spends, rulings, pages and actions.", undefined, 3200);
  await page.keyboard.press("Escape");
  await click(page.getByRole("link", { name: /AI Analysis/ }).first());
  await page.waitForURL("**/console/analysis");
  await say("Every ruling becomes a numbered case that later challengers can cite.", undefined, 4200);
  await click(page.getByRole("link", { name: /^Analytics/ }).first());
  await page.waitForURL("**/console/analytics");
  await say("Charts that each answer one question, drawn from real rulings.", undefined, 4200);

  await page.goto(base + "/", { waitUntil: "networkidle" });
  await pause(1000);
  await say("Chargeback", "The first verdict is trusted only because a stranger can fund a second one for less than the claim.", 5200);
  await say("github.com/s70239176-ctrl/chargeback", "Contract on GenLayer Studionet: 0xd21d37B4fD4ffe3134EF1CC9c8FD1312234aD072", 5200);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    const raw = await video.path();
    const target = join(outDir, "chargeback-demo.webm");
    copyFileSync(raw, target);
    console.log("wrote", target);
  }
}
