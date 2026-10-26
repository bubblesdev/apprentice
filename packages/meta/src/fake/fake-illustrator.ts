import type { Illustrator } from "@apprentice/core";

const escape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else line += ` ${word}`;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, maxLines);
}

/**
 * Stands in for Muse Image without credits: an SVG card that says plainly it is a placeholder,
 * so a fake diagram can never be mistaken for a generated one.
 */
export class FakeIllustrator implements Illustrator {
  readonly calls: string[] = [];

  async diagram(input: { title: string; instruction: string; parts: string[] }) {
    this.calls.push(input.title);
    const lines = wrap(input.title, 34, 3)
      .map(
        (l, i) =>
          `<text x="40" y="${118 + i * 34}" font-size="26" font-weight="600">${escape(l)}</text>`,
      )
      .join("");
    const parts = input.parts
      .slice(0, 4)
      .map(
        (p, i) =>
          `<text x="40" y="${262 + i * 26}" font-size="18" fill="#A0A4AB">· ${escape(p)}</text>`,
      )
      .join("");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" font-family="Inter, system-ui, sans-serif" fill="#F2F2EF">` +
      `<rect width="640" height="400" rx="24" fill="#14161A"/>` +
      `<rect x="20" y="20" width="600" height="360" rx="18" fill="none" stroke="#9DB8FF" stroke-dasharray="8 8" stroke-opacity="0.5"/>` +
      `<text x="40" y="70" font-size="14" fill="#9DB8FF" letter-spacing="1">DIAGRAM PLACEHOLDER · MUSE IMAGE NOT CALLED</text>` +
      lines +
      parts +
      `</svg>`;
    return { kind: "bytes" as const, mime: "image/svg+xml", data: new TextEncoder().encode(svg) };
  }
}
