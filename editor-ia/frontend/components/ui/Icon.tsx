// Ícones em SVG (traço), sem dependência externa.
const PATHS: Record<string, string> = {
  logo: "M12 3 3 7.5l9 4.5 9-4.5L12 3Zm-9 9 9 4.5 9-4.5M3 16.5 12 21l9-4.5",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  sharpen: "M12 3 4 20h16L12 3Zm0 6v7",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z",
  crop: "M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14",
  rotate: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  compare: "M12 3v18M7 7H4v10h3M17 7h3v10h-3",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  chevron: "m6 9 6 6 6-6",
  back: "M15 18l-6-6 6-6",
  download: "M12 4v12m0 0 4-4m-4 4-4-4M4 20h16",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5",
  shield: "M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3",
  x: "M6 6l12 12M18 6 6 18",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "", strokeWidth = 1.7 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name] ?? PATHS.sparkle} />
    </svg>
  );
}

/** Ícone sugerido para cada operação do catálogo. */
export const OPERATION_ICONS: Record<string, string> = {
  adjust: "sliders",
  sharpen: "sharpen",
  smooth: "drop",
  crop: "crop",
  rotate: "rotate",
};
