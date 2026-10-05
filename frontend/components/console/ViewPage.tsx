"use client";

import { useCourt } from "../../lib/court.tsx";
import { usd } from "../../lib/money.ts";
import { VIEW_META, inView, type View } from "../../lib/views.ts";
import { Button, Panel, Skeleton } from "../ui/index.tsx";
import { useShell } from "../shell/ShellContext.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { SpendTable } from "./SpendTable.tsx";
import c from "./console.module.css";

/** Opportunities, Active disputes, Won and Lost: one table, four slices of the same contract state. */
export function ViewPage({ view }: { view: View }) {
  const { spends, chainNow, loading, dataError } = useCourt();
  const { openNewSpend } = useShell();
  const meta = VIEW_META[view];
  const rows = (spends ?? []).filter((s) => inView(view, s, chainNow));
  const total = rows.reduce((n, s) => n + s.amount, 0);

  return (
    <>
      <PageHeader
        title={meta.title}
        sub={meta.blurb}
        actions={
          view === "opportunities" ? (
            <Button variant="primary" icon="plus" onClick={openNewSpend}>
              New spend
            </Button>
          ) : undefined
        }
      />
      {spends !== undefined && rows.length > 0 && (
        <p className={c.totalLine}>
          {rows.length} {rows.length === 1 ? "spend" : "spends"} · <strong>{usd(total)}</strong>
        </p>
      )}
      <Panel flush>
        <div className={c.tablePad}>
          {loading || spends === undefined ? (
            <div className={c.skeletonRows}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} h={44} />
              ))}
              {dataError && <p role="alert" style={{ color: "var(--danger)" }}>{dataError}</p>}
            </div>
          ) : (
            <SpendTable spends={rows} empty={meta.empty} filename={`chargeback-${view}`} />
          )}
        </div>
      </Panel>
    </>
  );
}
