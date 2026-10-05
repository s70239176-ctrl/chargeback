import type { ReactNode } from "react";
import c from "./console.module.css";

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={c.pageHead}>
      <div>
        <h1 className={c.pageTitle}>{title}</h1>
        {sub && <p className={c.pageSub}>{sub}</p>}
      </div>
      {actions && <div className={c.pageActions}>{actions}</div>}
    </header>
  );
}
