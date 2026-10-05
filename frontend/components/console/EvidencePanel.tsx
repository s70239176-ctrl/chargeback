"use client";

import { useState } from "react";
import type { Spend } from "../../lib/types.ts";
import { Panel } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import c from "./console.module.css";

interface Item {
  key: string;
  ok: boolean;
  title: string;
  type: string;
  source?: string;
  note: string;
  body?: string;
}

const when = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";

export function evidenceItems(spend: Spend): Item[] {
  const ch = spend.challenge;
  const items: Item[] = [
    {
      key: "page",
      ok: true,
      title: "Cited evidence page",
      type: "Web page",
      source: spend.evidenceUrl,
      note: `Fixed when the spend was opened, ${when(spend.openedAt)}. Every validator fetches it for itself.`,
    },
    {
      key: "trace",
      ok: true,
      title: "Agent trace",
      type: "Agent claim",
      note: "What the agent said it did. Treated as untrusted text, never as an instruction.",
      body: spend.trace,
    },
  ];
  if (ch) {
    items.push({
      key: "claim",
      ok: true,
      title: "Challenger's claim",
      type: "Claim",
      note: "Also untrusted: it is shown to the panel as data, and a ruling must still be backed by the pages.",
      body: ch.claim,
    });
    if (ch.counterUrl) {
      items.push({
        key: "counter",
        ok: true,
        title: "Counter page",
        type: "Web page",
        source: ch.counterUrl,
        note: "Optional page the challenger offered to contradict the mandate.",
      });
    }
    if (ch.evidenceQuote) {
      items.push({
        key: "quote",
        ok: true,
        title: "Quote the panel relied on",
        type: "Verbatim excerpt",
        source: spend.evidenceUrl,
        note: "The contract only accepts a MATCH or MISMATCH if every fragment of this quote appears word for word in the pages the panel read.",
        body: ch.evidenceQuote,
      });
    } else {
      items.push({
        key: "quote",
        ok: false,
        title: ch.verdictLabel === "INCONCLUSIVE" ? "No supporting quote (inconclusive)" : "Supporting quote",
        type: "Verbatim excerpt",
        note: ch.verdictLabel === "INCONCLUSIVE" ? "The pages did not settle the mandate, so no quote was relied on." : "Appears once the panel has ruled.",
      });
    }
  }
  return items;
}

export function EvidencePanel({ spend }: { spend: Spend }) {
  const items = evidenceItems(spend);
  const have = items.filter((i) => i.ok).length;
  const [open, setOpen] = useState<string | null>("quote");
  return (
    <Panel title="Evidence" action={<span className={c.dim}>{have} of {items.length} on record</span>}>
      <ul className={c.evidence}>
        {items.map((it) => (
          <li key={it.key} className={it.ok ? "" : c.evMissing}>
            <button
              type="button"
              className={c.evHead}
              aria-expanded={open === it.key}
              onClick={() => setOpen(open === it.key ? null : it.key)}
            >
              <span className={it.ok ? c.evOk : c.evNo} aria-hidden="true">
                {it.ok ? <Icon name="check" size={13} /> : <Icon name="circle" size={13} />}
              </span>
              <span className={c.evTitle}>{it.title}</span>
              <Icon name="down" size={16} className={open === it.key ? c.chevOpen : undefined} />
            </button>
            {open === it.key && (
              <div className={c.evBody}>
                <dl className={c.evMeta}>
                  <div>
                    <dt>Type</dt>
                    <dd>{it.type}</dd>
                  </div>
                  {it.source && (
                    <div>
                      <dt>Source</dt>
                      <dd className="mono">
                        <a href={it.source} target="_blank" rel="noreferrer">
                          View source <Icon name="external" size={12} />
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
                {it.body && <blockquote className={c.evQuote}>{it.body}</blockquote>}
                <p className={c.dim}>{it.note}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
