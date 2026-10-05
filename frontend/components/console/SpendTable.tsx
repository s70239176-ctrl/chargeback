"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { WhoName } from "../shared.tsx";
import { activeDeadline, countdown, formatClock } from "../../lib/clock.ts";
import { useCourt } from "../../lib/court.tsx";
import { toCsv } from "../../lib/derive.ts";
import { usd } from "../../lib/money.ts";
import type { Spend } from "../../lib/types.ts";
import { Button, EmptyState, FilterChips, StatusBadge, inputClass } from "../ui/index.tsx";
import { Icon } from "../ui/Icon.tsx";
import c from "./console.module.css";

type Filter = "all" | "value" | "expiring" | "challenged" | "mine";
type Sort = "newest" | "amount" | "deadline";

export function SpendTable({
  spends,
  empty,
  filename = "chargeback-spends",
}: {
  spends: readonly Spend[];
  empty: { title: string; body: string };
  filename?: string;
}) {
  const router = useRouter();
  const { chainNow, config, isMine, addresses } = useCourt();
  const tick = config?.tickSeconds ?? 60;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");

  const median = useMemo(() => {
    const a = spends.map((s) => s.amount).sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)] ?? 0;
  }, [spends]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = spends.filter((s) => {
      if (needle && !`#${s.id} ${s.id} ${s.mandate} ${s.evidenceUrl} ${s.trace} ${s.challenge?.verdictReason ?? ""}`.toLowerCase().includes(needle)) return false;
      if (filter === "value") return s.amount >= median;
      if (filter === "expiring") return s.status === "open" && s.challengeDeadline - chainNow <= tick;
      if (filter === "challenged") return s.challenge !== null;
      if (filter === "mine") return isMine(s);
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "amount") return b.amount - a.amount;
      if (sort === "deadline") return (activeDeadline(a) ?? Infinity) - (activeDeadline(b) ?? Infinity);
      return b.id - a.id;
    });
  }, [spends, q, filter, sort, median, chainNow, tick, isMine]);

  function exportCsv() {
    const csv = toCsv(
      rows.map((s) => ({
        spend: s.id,
        status: s.status,
        amount_usd: s.amount / 1e6,
        bond_usd: s.bond / 1e6,
        payer: s.payer,
        recipient: s.recipient,
        mandate: s.mandate,
        evidence_url: s.evidenceUrl,
        ruling: s.challenge?.verdictLabel ?? "",
        reason: s.challenge?.verdictReason ?? "",
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className={c.tableBar}>
        <label className={c.searchBox}>
          <Icon name="search" size={16} />
          <span className="sr-only">Search spends</span>
          <input
            className={c.searchInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search id, mandate, page or ruling"
            aria-label="Search spends"
          />
        </label>
        <FilterChips<Filter>
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All" },
            { id: "value", label: "High value" },
            { id: "expiring", label: "Expiring" },
            { id: "challenged", label: "Challenged" },
            { id: "mine", label: "Mine" },
          ]}
        />
        <div className={c.tableBarRight}>
          <label className={c.sortLabel}>
            <Icon name="sort" size={16} />
            <select className={`${inputClass} ${c.sortSelect}`} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
              <option value="newest">Newest</option>
              <option value="amount">Amount</option>
              <option value="deadline">Deadline</option>
            </select>
          </label>
          <Button size="sm" icon="download" onClick={exportCsv} disabled={rows.length === 0}>
            Export
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={spends.length === 0 ? empty.title : "Nothing matches."} body={spends.length === 0 ? empty.body : "Try clearing the search or the filter."} />
      ) : (
        <table className={c.table}>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Spend</th>
              <th scope="col">Payer to recipient</th>
              <th scope="col">Mandate</th>
              <th scope="col" className={c.num}>Amount</th>
              <th scope="col">Ruling</th>
              <th scope="col">Deadline</th>
              <th scope="col"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const dl = activeDeadline(s);
              const left = dl !== null ? countdown(dl, chainNow, tick) : null;
              return (
                <tr key={s.id} className={c.row} onClick={() => router.push(`/console/spend/${s.id}`)}>
                  <td data-label="Status"><StatusBadge spend={s} now={chainNow} tick={tick} /></td>
                  <td data-label="Spend" className="mono">#{s.id}</td>
                  <td data-label="Parties" className={c.parties}>
                    <WhoName addresses={addresses} address={s.payer} /> <span className={c.dim}>to</span> <WhoName addresses={addresses} address={s.recipient} />
                  </td>
                  <td data-label="Mandate" className={c.mandateCell}><div className={c.clamp}>{s.mandate}</div></td>
                  <td data-label="Amount" className={`${c.num} mono`}>{usd(s.amount)}</td>
                  <td data-label="Ruling">{s.challenge?.verdictLabel ? <span className={c.dim}>{s.challenge.verdictLabel}</span> : <span className={c.faint}>—</span>}</td>
                  <td data-label="Deadline" className="mono">{left ? (left.closed ? "closed" : formatClock(left.secondsLeft)) : <span className={c.faint}>—</span>}</td>
                  <td className={c.actionCell}>
                    <a
                      href={`/console/spend/${s.id}`}
                      className={c.rowLink}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/console/spend/${s.id}`);
                      }}
                    >
                      Review <Icon name="arrow" size={14} />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
