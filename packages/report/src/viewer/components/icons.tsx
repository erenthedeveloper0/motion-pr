import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Play: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Pause: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth={1.8} />
    </Svg>
  ),
  StepBack: (p: IconProps) => (
    <Svg {...p}>
      <path d="M11 4 6 8l5 4M4.5 4v8" />
    </Svg>
  ),
  StepForward: (p: IconProps) => (
    <Svg {...p}>
      <path d="m5 4 5 4-5 4M11.5 4v8" />
    </Svg>
  ),
  Start: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4 7 8l5 4M8.5 4 3.5 8l5 4" />
    </Svg>
  ),
  Loop: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 7.5V7a3 3 0 0 1 3-3h6m-2-2 2 2-2 2M13 8.5V9a3 3 0 0 1-3 3H4m2 2-2-2 2-2" />
    </Svg>
  ),
  Side: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.75" y="3.25" width="5.5" height="9.5" rx="1" />
      <rect x="8.75" y="3.25" width="5.5" height="9.5" rx="1" />
    </Svg>
  ),
  Overlay: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="2.5" width="8.5" height="8" rx="1" />
      <rect x="5.5" y="5.5" width="8.5" height="8" rx="1" fill="currentColor" fillOpacity={0.2} />
    </Svg>
  ),
  Onion: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="5.5" cy="8" r="3.25" strokeOpacity={0.35} />
      <circle cx="8" cy="8" r="3.25" strokeOpacity={0.6} />
      <circle cx="10.5" cy="8" r="3.25" />
    </Svg>
  ),
  Wipe: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M8 1.5v13" />
      <path d="M8 3h6v10H8z" fill="currentColor" fillOpacity={0.2} stroke="none" />
    </Svg>
  ),
  Difference: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="6.25" cy="8" r="4" />
      <circle cx="9.75" cy="8" r="4" />
      <path d="M8 4.7a4 4 0 0 1 0 6.6 4 4 0 0 1 0-6.6z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Pixel: (p: IconProps) => (
    <Svg {...p}>
      <path
        d="M2.5 2.5h3v3h-3zM6.5 6.5h3v3h-3zM10.5 10.5h3v3h-3zM10.5 2.5h3v3h-3zM2.5 10.5h3v3h-3z"
        fill="currentColor"
        stroke="none"
        fillOpacity={0.85}
      />
    </Svg>
  ),
  ZoomIn: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3M5 7h4M7 5v4" />
    </Svg>
  ),
  ZoomOut: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3M5 7h4" />
    </Svg>
  ),
  Fit: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    </Svg>
  ),
  Search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </Svg>
  ),
  Download: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 2.5v8m-3.5-3.5L8 10.5l3.5-3.5M3 13.5h10" />
    </Svg>
  ),
  Copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" />
    </Svg>
  ),
  Keyboard: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
      <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6" />
    </Svg>
  ),
  Chevron: (p: IconProps) => (
    <Svg {...p}>
      <path d="m6 4 4 4-4 4" />
    </Svg>
  ),
  Close: (p: IconProps) => (
    <Svg {...p}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Svg>
  ),
  Box: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="10" height="10" rx="0.5" strokeDasharray="2 1.5" />
    </Svg>
  ),
  Panel: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M10 2.75v10.5" />
    </Svg>
  ),
  Command: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 6V4.5A1.5 1.5 0 1 0 4.5 6H6zm0 0h4m-4 0v4m4-4V4.5A1.5 1.5 0 1 1 11.5 6H10zm0 0v4m0 0h1.5A1.5 1.5 0 1 1 10 11.5V10zm0 0H6m0 0v1.5A1.5 1.5 0 1 1 4.5 10H6z" />
    </Svg>
  ),
  Alert: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 2.5 14 13H2z" />
      <path d="M8 6.5v3M8 11.25h.01" />
    </Svg>
  ),
};
