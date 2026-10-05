/** The Chargeback mark: an open ring (the challenge window) with the money as a bead in the gap. */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="15" fill="var(--surface-2)" />
      <path d="M46.26 41.26A17 17 0 1 1 46.26 22.74" fill="none" stroke="var(--text)" strokeWidth="6.6" />
      <circle cx="49" cy="32" r="5.9" fill="var(--positive)" />
    </svg>
  );
}
