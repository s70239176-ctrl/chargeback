import { EmptyState } from "../../../../components/ui";
import { SpendDetail } from "../../../../components/console/SpendDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return <EmptyState title="That is not a spend number." body="Spend numbers start at 1." />;
  return <SpendDetail id={n} />;
}
