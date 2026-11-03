import type { StepReport } from "@apprentice/core";
import { useParams } from "react-router";
import { Button, ButtonLink, IconLink } from "../../components/Button";
import { FrameImage } from "../../components/FrameImage";
import { Card, Footer, Screen, TopBar } from "../../components/Screen";
import { api, evidenceFrameUrl } from "../../lib/api";
import { cx } from "../../lib/cx";
import { duration } from "../../lib/format";
import { useResource } from "../../lib/useResource";
import styles from "./Report.module.css";
import { AuditCard } from "./AuditCard";
import { caughtLabel, summarise } from "./reportView";

const CIRCUMFERENCE = 2 * Math.PI * 42;

function frameOf(keys: readonly string[] | undefined): string | undefined {
  const key = keys?.at(-1);
  return key ? evidenceFrameUrl(key) : undefined;
}

function cellLabel(step: StepReport): string {
  const status = {
    passed: "verified",
    unverified: "confirmed by you",
    in_progress: "in progress",
    failed: "not finished",
    not_reached: "not reached",
  }[step.status];
  return `Step ${step.index + 1}, ${status}`;
}

function when(startedAt: string): string {
  const d = new Date(startedAt);
  const today = new Date().toDateString() === d.toDateString();
  return today ? "Today" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ReportScreen() {
  const sessionId = useParams().sessionId ?? "";
  const report = useResource(`report:${sessionId}`, () => api.report(sessionId));
  const r = report.data;
  const audit = useResource(`audit:${sessionId}:${r?.complete ? "done" : "open"}`, () =>
    r?.complete ? api.audit(sessionId) : Promise.resolve(undefined),
  );
  const summary = r ? summarise(r) : undefined;
  const ratio = r && r.total ? r.passed / r.total : 0;

  const share = async () => {
    const url = window.location.href;
    const text = summary ? `${summary.headline}. ${summary.sentence}` : "Apprentice run report";
    if (navigator.share)
      await navigator.share({ title: "Apprentice run report", text, url }).catch(() => undefined);
    else await navigator.clipboard?.writeText(url);
  };

  return (
    <Screen>
      <TopBar
        leading={<IconLink to="/" icon="close" label="Close report" />}
        title={
          r
            ? [when(r.startedAt), r.durationS !== undefined ? duration(r.durationS) : ""]
                .filter(Boolean)
                .join(" · ")
            : ""
        }
      />
      {report.error && !r ? <p className={styles.error}>{report.error.message}</p> : null}
      {r && summary ? (
        <>
          <section className={styles.score}>
            <div className={styles.ring}>
              <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  fill="none"
                  stroke="rgba(157,184,255,0.18)"
                  strokeWidth="7"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  fill="none"
                  stroke="#9DB8FF"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
                  transform="rotate(-90 48 48)"
                />
              </svg>
              <span aria-label={`${r.passed} of ${r.total} steps verified`}>
                {r.passed}/{r.total}
              </span>
            </div>
            <div className={styles.headline}>
              <h1>{summary.headline}</h1>
              <p>{summary.sentence}</p>
            </div>
          </section>

          {summary.featured ? (
            <Card className={styles.caught}>
              <div className={styles.caughtHeader}>
                <span className={styles.caughtLabel}>
                  {caughtLabel(summary.featured.verdict.kind)} · Step{" "}
                  {summary.featured.step.index + 1}
                </span>
                <span className={styles.caughtState}>
                  {summary.featured.fixed ? "Fixed on retry" : "Not fixed"}
                </span>
              </div>
              <span>{summary.featured.verdict.evidence.sentence}</span>
              <div className={styles.pair}>
                <FrameImage
                  src={frameOf(summary.featured.verdict.evidence.frameKeys)}
                  alt="The attempt the coach caught"
                  tag="First try"
                />
                {summary.featured.fixed ? (
                  <FrameImage
                    src={frameOf(summary.featured.step.final?.evidence.frameKeys)}
                    alt="The corrected attempt"
                    tag="Fixed"
                  />
                ) : null}
              </div>
            </Card>
          ) : null}

          {r.complete ? <AuditCard audit={audit.data} loading={audit.loading} /> : null}

          <section className={styles.evidence}>
            <h2 className="eyebrow">Evidence, step by step</h2>
            <ol className={styles.strip}>
              {r.steps.map((s) => (
                <li
                  key={s.index}
                  className={cx(
                    styles.cell,
                    s.status !== "passed" && styles.cellOpen,
                    s.status === "unverified" && styles.cellUnverified,
                    s.caught.length > 0 && styles.cellCaught,
                  )}
                >
                  <FrameImage src={frameOf(s.final?.evidence.frameKeys)} alt={cellLabel(s)} />
                  <span className={styles.cellNumber} aria-hidden="true">
                    {s.index + 1}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
      <Footer>
        <div className={styles.actions}>
          <Button block icon="share" onClick={() => void share()}>
            Share report
          </Button>
          <ButtonLink to="/" variant="secondary" block>
            Back to guides
          </ButtonLink>
        </div>
      </Footer>
    </Screen>
  );
}
