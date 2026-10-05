const PATHS = {
  overview: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10",
  recovery: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5",
  intel: "M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  tx: "M4 8h13l-3-3M20 16H7l3 3",
  analytics: "M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 12l1.7-1-1.5-2.6-1.9.6-1.5-1.1-.3-2h-3l-.4 2-1.4 1.1-1.9-.6L5.3 11 7 12v1.8l-1.7 1 1.5 2.6 1.9-.6 1.4 1.1.4 2h3l.3-2 1.5-1.1 1.9.6 1.5-2.6-1.7-1V12Z",
  help: "M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.1 1-1.1 1.8M12 17h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  check: "m5 12.5 4.5 4.5L19 7.5",
  circle: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  close: "M6 6l12 12M18 6 6 18",
  panel: "M4 5h16v14H4zM9 5v14",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  shield: "M12 3 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-3Z",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  filter: "M4 6h16M7 12h10M10 18h4",
  sort: "M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3",
  won: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3",
  lost: "M6 6l12 12M6 18 18 6",
  active: "M4 12h4l2-6 4 12 2-6h4",
  sidebar: "M4 5h16v14H4zM9 5v14M6 9h.01",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
