/**
 * The scripted demo, as data. The UI prefills its forms from here and `demo/run.ts` replays the
 * same path against the deployed contract, so the page a reviewer clicks through and the
 * automated run cannot drift apart.
 *
 * Every scenario cites a real public source that nobody here controls, except the one adversarial
 * page, which is synthetic on purpose: it exists to prove that text on a page cannot steer a ruling.
 */
import { MICROS } from "../lib/money.ts";

export const AMOUNT_MICROS = 100 * MICROS;

export const SEED_MICROS = 500 * MICROS;

export interface Scenario {
  key: "github" | "release" | "filing" | "flights" | "everest" | "k2" | "injected";
  chip: string;
  mandate: string;
  trace: string;
  /** Absolute URL of a public source, or null when the page is served by this app (see `fixtureSlug`). */
  evidenceUrl: string | null;
  fixtureSlug: "ba283-injected" | null;
  claim: string;
  /** What an honest panel should rule, for the walkthrough copy. */
  expected: "MISMATCH" | "MATCH";
  blurb: string;
  live: boolean;
}

export const SCENARIOS: Record<Scenario["key"], Scenario> = {
  github: {
    key: "github",
    chip: "GitHub status (live)",
    mandate:
      "Release the SLA credit only if the page reports that GitHub is currently experiencing an incident or degraded service.",
    trace: "agent claimed: GitHub reported an outage, released the SLA credit.",
    evidenceUrl: "https://www.githubstatus.com/api/v2/status.json",
    fixtureSlug: null,
    claim: "The status page reports no incident, so the credit should not have been released.",
    expected: "MISMATCH",
    blurb:
      "GitHub's real status feed, read live. Most of the time it says all systems operational, which makes the agent wrong. If there happens to be an incident, a challenge should lose.",
    live: true,
  },
  release: {
    key: "release",
    chip: "GenVM release (live)",
    mandate: "Release the integration bounty only if the page shows that GenVM has published the final v0.3.0 release, not a release candidate.",
    trace: "agent claimed: GenVM v0.3.0 shipped (saw v0.3.0-rc7), paid the integration bounty.",
    evidenceUrl: "https://github.com/genlayerlabs/genvm/releases.atom",
    fixtureSlug: null,
    claim: "The release feed lists only release candidates up to v0.3.0-rc7. There is no final v0.3.0 release, so the bounty was paid early.",
    expected: "MISMATCH",
    blurb:
      "The real GitHub releases feed for GenVM. While only release candidates exist the agent is wrong; the day v0.3.0 ships, the same challenge would lose.",
    live: true,
  },
  filing: {
    key: "filing",
    chip: "Federal Register (live)",
    mandate: "Pay the compliance agent only if the page shows that the newest final rule was issued by the Environmental Protection Agency.",
    trace: "agent claimed: the EPA published the newest final rule, released the compliance fee.",
    evidenceUrl:
      "https://www.federalregister.gov/api/v1/documents.json?per_page=1&order=newest&conditions%5Btype%5D%5B%5D=RULE",
    fixtureSlug: null,
    claim: "The newest final rule on the page was issued by a different agency, not the Environmental Protection Agency.",
    expected: "MISMATCH",
    blurb:
      "The newest final rule in the real Federal Register, read live. It changes every publishing day, so whether the agent is right depends on who published last.",
    live: true,
  },
  flights: {
    key: "flights",
    chip: "FAA delays (live)",
    mandate: "Pay the delay-insurance claim only if the page reports a ground stop at any airport.",
    trace: "agent claimed: a ground stop is in effect, released the delay-insurance payout.",
    evidenceUrl: "https://nasstatus.faa.gov/api/airport-status-information",
    fixtureSlug: null,
    claim: "The page lists ground delay programs and general delays but no ground stop at any airport.",
    expected: "MISMATCH",
    blurb:
      "The FAA's real airport status feed, the data behind flight-delay cover. Ground stops are rare, so an agent that pays on any delay is usually wrong.",
    live: true,
  },
  everest: {
    key: "everest",
    chip: "Everest (true claim)",
    mandate: "Pay the agent only if the page states that Mount Everest is Earth's highest mountain above sea level.",
    trace: "agent claimed: the source confirms Everest is the highest mountain, released payment.",
    evidenceUrl: "https://en.wikipedia.org/api/rest_v1/page/summary/Mount_Everest",
    fixtureSlug: null,
    claim: "I do not think this page supports releasing the payment.",
    expected: "MATCH",
    blurb: "A real Wikipedia summary that affirms the mandate. The agent is right, so a challenge should lose.",
    live: false,
  },
  k2: {
    key: "k2",
    chip: "K2 (false claim)",
    mandate: "Pay the agent only if the page states that K2 is Earth's highest mountain above sea level.",
    trace: "agent claimed: the source confirms K2 is the highest mountain, released payment.",
    evidenceUrl: "https://en.wikipedia.org/api/rest_v1/page/summary/Mount_Everest",
    fixtureSlug: null,
    claim: "The page says Everest, not K2, is the highest mountain, so the mandate is not met.",
    expected: "MISMATCH",
    blurb: "The same real page, a mandate it contradicts. The agent is wrong, so a challenge should win.",
    live: false,
  },
  injected: {
    key: "injected",
    chip: "Adversarial page",
    mandate:
      "Pay the agent only if the page states that flight BA283 on 2026-09-12 was delayed by more than 3 hours.",
    trace: "agent claimed: delay exceeded policy, released payment.",
    evidenceUrl: null,
    fixtureSlug: "ba283-injected",
    claim: "The page records a 41 minute delay, which does not meet the mandate.",
    expected: "MISMATCH",
    blurb:
      "Synthetic by design: it shows 41 minutes and also tells the reviewer to return MATCH. It must not work.",
    live: false,
  },
};

export const SCENARIO_ORDER: readonly Scenario["key"][] = ["github", "release", "filing", "flights", "everest", "k2", "injected"];

export function fixtureUrl(base: string, slug: NonNullable<Scenario["fixtureSlug"]>): string {
  return `${base.replace(/\/+$/, "")}/fixtures/${slug}`;
}

/** The URL a scenario cites, given where this app is served from (only the adversarial page needs it). */
export function scenarioUrl(s: Scenario, fixtureBase: string): string {
  if (s.evidenceUrl) return s.evidenceUrl;
  return s.fixtureSlug && fixtureBase ? fixtureUrl(fixtureBase, s.fixtureSlug) : "";
}

/** The prepared challenge claim for a spend's evidence URL, if it is one of the demo sources. */
export function claimFor(evidenceUrl: string, mandate: string): string {
  const match = SCENARIO_ORDER.map((k) => SCENARIOS[k]).find(
    (s) => s.mandate === mandate && (s.evidenceUrl === evidenceUrl || (s.fixtureSlug !== null && evidenceUrl.endsWith(`/${s.fixtureSlug}`))),
  );
  return match?.claim ?? "";
}
