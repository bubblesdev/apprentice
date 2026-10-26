import type { RunAudit } from "@apprentice/core";
import { Card } from "../../components/Screen";
import styles from "./Report.module.css";

/** Muse Wonder's review of the run: a summary for the trainee, notes for a supervisor and the guide's author. */
export function AuditCard({ audit, loading }: { audit: RunAudit | undefined; loading: boolean }) {
  return (
    <Card className={styles.audit}>
      <div className={styles.auditHeader}>
        <h2 className="eyebrow">Review of this run</h2>
        <span className={styles.auditSource}>
          {audit?.source === "rules" ? "Rules, no model called" : "Muse Wonder"}
        </span>
      </div>
      {loading && !audit ? <p className={styles.auditMuted}>Reading the evidence</p> : null}
      {audit ? (
        <>
          <p>{audit.summary}</p>
          {audit.concerns.length ? (
            <div className={styles.auditList}>
              <span className={styles.auditLabel}>Worth a second look</span>
              <ul>
                {audit.concerns.map((c) => (
                  <li key={`c${c.stepIndex}${c.note}`}>
                    <strong>Step {c.stepIndex + 1}.</strong> {c.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {audit.suggestions.length ? (
            <div className={styles.auditList}>
              <span className={styles.auditLabel}>For the guide&apos;s author</span>
              <ul>
                {audit.suggestions.map((s) => (
                  <li key={`s${s.stepIndex}${s.suggestion}`}>
                    <strong>Step {s.stepIndex + 1}.</strong> {s.suggestion}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
