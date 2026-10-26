/** The prototype's progress states: done (filled check), active (spinning ring), pending (outline). */
import { Icon } from "./Icon";

export function StageMark({ state }: { state: "done" | "active" | "pending" | "skipped" }) {
  const base = {
    width: 26,
    height: 26,
    borderRadius: 13,
    flexShrink: 0,
    boxSizing: "border-box" as const,
  };
  if (state === "done") {
    return (
      <span
        style={{
          ...base,
          background: "var(--color-accent)",
          color: "var(--color-on-accent)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Icon name="check" size={14} strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        style={{
          ...base,
          border: "2.5px solid rgba(157,184,255,0.25)",
          borderTopColor: "var(--color-accent)",
          animation: "spin 0.9s linear infinite",
        }}
      />
    );
  }
  return (
    <span
      style={{
        ...base,
        border: `1.5px ${state === "skipped" ? "dashed" : "solid"} rgba(255,255,255,0.18)`,
      }}
    />
  );
}
