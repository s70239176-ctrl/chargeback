export const MICROS = 1_000_000;

/** Mirror of the contract's bond rule: 10% of the amount, never below 5 USDC. */
export function bondFor(amountMicros: number, bondBps = 1000, minBond = 5 * MICROS): number {
  return Math.max(Math.floor((amountMicros * bondBps) / 10_000), minBond);
}

export function formatUsdc(micros: number, withUnit = true): string {
  const whole = Math.trunc(micros / MICROS);
  const frac = Math.abs(micros % MICROS);
  const text = frac === 0 ? whole.toLocaleString("en-US") : `${whole.toLocaleString("en-US")}.${String(frac).padStart(6, "0").replace(/0+$/, "").padEnd(2, "0")}`;
  return withUnit ? `${text} USDC` : text;
}

/** "100" or "12.5" -> micros. Returns null for anything that is not a plain non-negative amount. */
export function parseUsdc(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return Number(w) * MICROS + Number(f.padEnd(6, "0"));
}

export function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** Whole dollars unless cents matter: $284,920 not $284,920.00. Mock USDC is shown as $. */
export function usd(micros: number): string {
  const whole = Math.trunc(micros / MICROS);
  const cents = Math.round((Math.abs(micros % MICROS) / MICROS) * 100);
  const w = whole.toLocaleString("en-US");
  return cents === 0 ? `$${w}` : `$${w}.${String(cents).padStart(2, "0")}`;
}

/** $42K, $1.3M: for chart labels where space is tight. */
export function usdCompact(micros: number): string {
  const d = micros / MICROS;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (d >= 1_000) return `$${(d / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(d)}`;
}
