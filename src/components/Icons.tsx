import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export function Logo(props: IconProps) {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <rect x="5" y="3" width="17" height="23" rx="2" fill="var(--sheet)" stroke="var(--ink)" strokeWidth="1.8" />
      <path d="M9 9h9M9 13h9M9 17h5" stroke="var(--ink-soft)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="21" cy="21" r="6.5" fill="var(--stamp-soft)" stroke="var(--stamp)" strokeWidth="2" />
      <path d="M25.6 25.6 29 29" stroke="var(--stamp)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

export function SortIcon({ dir, ...props }: IconProps & { dir: 'asc' | 'desc' | null }) {
  return (
    <svg {...base({ width: 12, height: 12, ...props })}>
      {dir !== 'desc' && <path d="m7 10 5-5 5 5" opacity={dir === 'asc' ? 1 : 0.35} />}
      {dir !== 'asc' && <path d="m7 14 5 5 5-5" opacity={dir === 'desc' ? 1 : 0.35} />}
    </svg>
  );
}

/** Hero illustration: a fanned stack of invoices with an official stamp. */
export function SheetsIllustration() {
  return (
    <svg className="sheets" viewBox="0 0 280 150" aria-hidden="true">
      <g transform="rotate(-7 90 80)">
        <rect x="30" y="18" width="104" height="128" rx="4" fill="var(--paper)" stroke="var(--rule-strong)" />
      </g>
      <g transform="rotate(4 150 80)">
        <rect x="88" y="12" width="104" height="128" rx="4" fill="var(--paper)" stroke="var(--rule-strong)" />
      </g>
      <rect x="146" y="8" width="104" height="132" rx="4" fill="var(--sheet)" stroke="var(--ink)" strokeWidth="1.4" />
      <path d="M160 28h52M160 40h76M160 52h64M160 76h76M160 88h76M160 100h76" stroke="var(--rule-strong)" strokeWidth="3" strokeLinecap="round" />
      <path d="M196 120h40" stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" />
      <g transform="rotate(-12 220 58)" stroke="var(--stamp)" fill="none">
        <circle cx="220" cy="58" r="22" strokeWidth="2.6" />
        <circle cx="220" cy="58" r="17" strokeWidth="1" />
        <path d="m211 58 6 6 12-12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
