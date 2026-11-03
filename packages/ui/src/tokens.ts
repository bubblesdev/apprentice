/**
 * Design tokens from the approved prototype (26 Oct): dark first, one accent, amber for
 * "show me closer", coral for "stop". Plain values so web (CSS variables) and future native
 * shells (SwiftUI, Compose) read the same source.
 */
export const color = {
  bg: "#0A0B0D",
  surface: "#14161A",
  surfaceRaised: "#1C1F24",
  text: "#F2F2EF",
  textSoft: "#DADBD7",
  muted: "#A0A4AB",
  accent: "#9DB8FF",
  accentHover: "#C3D3FF",
  onAccent: "#0A0B0D",
  amber: "#F2B65A",
  amberSoft: "#F2D9AE",
  coral: "#FF7A5C",
  coralSoft: "#FFB4A3",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  glass: "rgba(18,20,24,0.78)",
  glassLight: "rgba(20,22,26,0.6)",
} as const;

export const font = {
  display: "'Inter Tight', Inter, system-ui, sans-serif",
  body: "Inter, system-ui, sans-serif",
} as const;

/** Type scale in px: [size, line height]. */
export const type = {
  hero: [34, 1.08],
  title: [28, 1.15],
  instruction: [22, 1.22],
  body: [15, 1.5],
  small: [13, 1.45],
  label: [12, 1.3],
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 12, md: 16, lg: 20, xl: 24, sheet: 30, pill: 999 } as const;

/** Minimum touch target (px); primary actions use 56. */
export const touch = { min: 44, primary: 56 } as const;

export const motion = {
  fast: "160ms",
  base: "250ms",
  slow: "400ms",
  ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

export const blur = { glass: 24, chip: 16 } as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Tokens as CSS custom properties, e.g. `--color-accent`, `--radius-xl`. */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(color)) vars[`--color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(font)) vars[`--font-${k}`] = v;
  for (const [k, [size, lh]] of Object.entries(type)) {
    vars[`--type-${k}-size`] = `${size}px`;
    vars[`--type-${k}-lh`] = String(lh);
  }
  for (const [k, v] of Object.entries(space)) vars[`--space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(touch)) vars[`--touch-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(motion)) vars[`--motion-${k}`] = v;
  for (const [k, v] of Object.entries(blur)) vars[`--blur-${k}`] = `${v}px`;
  return vars;
}
