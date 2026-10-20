import type { JSX } from 'preact';

type P = { size?: number; filled?: boolean };

const Svg = ({ size = 22, children }: { size?: number; children: JSX.Element | JSX.Element[] }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconBookmark = ({ size, filled }: P) => (
  <Svg size={size}>
    <path d="M7 3.5h10v17l-5-3.6-5 3.6z" fill={filled ? 'currentColor' : 'none'} />
  </Svg>
);
export const IconAa = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 18 8 6l5 12M4.8 14h6.4" />
    <path d="M20.5 18v-5.2a2.6 2.6 0 0 0-5 0M15.5 15.6c0 1.6 1.2 2.4 2.5 2.4s2.5-.9 2.5-2.6v-.9h-2.4c-1.5 0-2.6.4-2.6 1.1z" />
  </Svg>
);
export const IconLeft = ({ size }: P) => (
  <Svg size={size}>
    <path d="m14.5 5-7 7 7 7" />
  </Svg>
);
export const IconRight = ({ size }: P) => (
  <Svg size={size}>
    <path d="m9.5 5 7 7-7 7" />
  </Svg>
);
export const IconCheck = ({ size }: P) => (
  <Svg size={size}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconPlus = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconNotes = ({ size }: P) => (
  <Svg size={size}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Svg>
);
export const IconPen = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" />
    <path d="m13.5 7 3 3" />
  </Svg>
);
export const IconMore = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="6" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);
export const IconUndo = ({ size }: P) => (
  <Svg size={size}>
    <path d="M9 7 4.5 11.5 9 16" />
    <path d="M5 11.5h9.5a5 5 0 0 1 0 10H12" />
  </Svg>
);
export const IconRedo = ({ size }: P) => (
  <Svg size={size}>
    <path d="m15 7 4.5 4.5L15 16" />
    <path d="M19 11.5H9.5a5 5 0 0 0 0 10H12" />
  </Svg>
);
export const IconClose = ({ size }: P) => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconShare = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 3.5v11M8 7.5l4-4 4 4" />
    <path d="M7 11H5.5v9.5h13V11H17" />
  </Svg>
);
export const IconTrash = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </Svg>
);
export const IconGear = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </Svg>
);
export const IconPin = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);
export const IconClock = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconBook = ({ size }: P) => (
  <Svg size={size}>
    <path d="M5 4.5h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" />
    <path d="M5 17.5a2 2 0 0 1 2-2h11.5" />
  </Svg>
);

/** Toolbar tools are drawn as the tip of the instrument, like a pencil cup. */
export function ToolTip({ tool, color }: { tool: 'pen' | 'pencil' | 'marker' | 'eraser'; color: string }) {
  const body = 'var(--tool-body)';
  const line = 'var(--tool-line)';
  if (tool === 'eraser')
    return (
      <svg width="30" height="56" viewBox="0 0 30 56" aria-hidden="true">
        <rect x="6" y="14" width="18" height="44" rx="3" fill={body} stroke={line} />
        <rect x="6" y="6" width="18" height="14" rx="4" fill="#e9a3a8" stroke={line} />
        <path d="M10 13l10-4" stroke="#c75b66" stroke-width="1.5" />
      </svg>
    );
  if (tool === 'marker')
    return (
      <svg width="30" height="56" viewBox="0 0 30 56" aria-hidden="true">
        <path d="M5 22h20v36H5z" fill={body} stroke={line} />
        <path d="M8 22l2-10h10l2 10z" fill={body} stroke={line} />
        <path d="M11 12l1-6h7l-1 6z" fill={color} opacity="0.85" />
        <rect x="5" y="30" width="20" height="5" fill={color} opacity="0.85" />
      </svg>
    );
  if (tool === 'pencil')
    return (
      <svg width="30" height="56" viewBox="0 0 30 56" aria-hidden="true">
        <path d="M6 24h18v34H6z" fill={body} stroke={line} />
        <path d="M6 24l9-20 9 20z" fill="#e6c79c" stroke={line} />
        <path d="M12.3 10 15 4l2.7 6z" fill={color} />
      </svg>
    );
  return (
    <svg width="30" height="56" viewBox="0 0 30 56" aria-hidden="true">
      <path d="M6 26h18v32H6z" fill={body} stroke={line} />
      <path d="M6 26l7-18h4l7 18z" fill={body} stroke={line} />
      <path d="M13 8l2-5 2 5z" fill={color} />
      <rect x="6" y="34" width="18" height="4" fill={color} />
    </svg>
  );
}
