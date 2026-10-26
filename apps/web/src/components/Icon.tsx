import type { SVGProps } from "react";

/** Stroke icons from the approved prototype. Decorative by default; pass a `title` to label one. */
const PATHS = {
  check: <path d="M5 12l4 4 10-10" />,
  back: <path d="M15 6l-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="3" />
      <path d="M16 10l5-3v10l-5-3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1" />
      <path d="M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h8l5 5v13H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h7M9 17h5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  share: (
    <>
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 14v5h14v-5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  zoom: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4M11 8v6M8 11h6" />
    </>
  ),
  stop: <path d="M12 7v6M12 17h.01" />,
  speaker: (
    <>
      <path d="M4 10v4h4l5 4V6L8 10z" />
      <path d="M16 9a4 4 0 010 6M19 6a8 8 0 010 12" />
    </>
  ),
  muted: (
    <>
      <path d="M4 10v4h4l5 4V6L8 10z" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </>
  ),
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  title?: string;
}

export function Icon({ name, size = 20, strokeWidth = 2, title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
