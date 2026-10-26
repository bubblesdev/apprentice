import { Button } from "../../components/Button";
import { FrameImage } from "../../components/FrameImage";
import { Icon } from "../../components/Icon";
import { cx } from "../../lib/cx";
import styles from "./Coach.module.css";
import type { CoachPanel as Panel } from "./coachView";

export interface PanelActions {
  begin: () => void;
  check: () => void;
  next: () => void;
  acknowledge: () => void;
  override: () => void;
  ask: () => void;
}

interface Props {
  panel: Panel;
  actions: PanelActions;
  busy: boolean;
  /** The trainee's last captured frame and the expert's, for the side-by-side on a mistake. */
  youSrc: string | undefined;
  expertSrc: string | undefined;
}

function Status({
  badge,
  tone,
  title,
  sentence,
}: {
  badge: "check" | "zoom" | "stop" | "warning";
  tone: "accent" | "amber" | "coral";
  title: string;
  sentence?: string | undefined;
}) {
  return (
    <div className={styles.status}>
      <span
        className={cx(
          styles.badge,
          tone === "amber" && styles.badgeAmber,
          tone === "coral" && styles.badgeCoral,
        )}
      >
        <Icon name={badge} size={20} strokeWidth={badge === "check" ? 3 : 2.4} />
      </span>
      <span className={styles.statusText}>
        <span
          className={cx(
            styles.statusTitle,
            tone === "amber" && styles.amberText,
            tone === "coral" && styles.coralText,
          )}
        >
          {title}
        </span>
        {sentence ? <span className={styles.statusSentence}>{sentence}</span> : null}
      </span>
    </div>
  );
}

/** The bottom sheet's state-specific half: what happened and the one thing to do next. */
export function CoachPanel({ panel, actions, busy, youSrc, expertSrc }: Props) {
  switch (panel.kind) {
    case "briefing":
      return (
        <div className={styles.actions}>
          {panel.warning ? (
            <Status
              badge="warning"
              tone="amber"
              title="Before you start"
              sentence={panel.warning}
            />
          ) : null}
          <Button block disabled={busy} onClick={actions.begin}>
            Start this step
          </Button>
        </div>
      );
    case "doing":
      return (
        <div className={styles.actions}>
          {panel.note ? (
            <Status
              badge="zoom"
              tone="amber"
              title={panel.note.title}
              sentence={panel.note.sentence}
            />
          ) : null}
          <div className={styles.doingRow}>
            <Button block disabled={busy} onClick={actions.check}>
              I&rsquo;m done, check it
            </Button>
            <button
              type="button"
              className={styles.mic}
              aria-label="Ask a question"
              onClick={actions.ask}
            >
              <Icon name="mic" size={22} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      );
    case "verifying":
      return (
        <div className={styles.status} role="status">
          <svg
            className={styles.ring}
            width="44"
            height="44"
            viewBox="0 0 44 44"
            aria-hidden="true"
          >
            <circle
              cx="22"
              cy="22"
              r="20"
              fill="none"
              stroke="rgba(157,184,255,0.2)"
              strokeWidth="3"
            />
            <circle
              cx="22"
              cy="22"
              r="20"
              fill="none"
              stroke="#9DB8FF"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="126"
              strokeDashoffset="126"
              transform="rotate(-90 22 22)"
            />
          </svg>
          <span className={styles.statusText}>
            <span className={styles.statusTitle}>Checking against the expert</span>
            <span className={styles.statusSentence}>{panel.detail}</span>
          </span>
        </div>
      );
    case "pass":
      return (
        <div className={styles.actions}>
          <Status badge="check" tone="accent" title="Looks right" sentence={panel.sentence} />
          <Button variant="light" block disabled={busy} onClick={actions.next}>
            {panel.last ? "See your report" : "Next step"}
          </Button>
        </div>
      );
    case "closer":
      return (
        <div className={styles.actions}>
          <Status badge="zoom" tone="amber" title={panel.title} sentence={panel.sentence} />
          <Button variant="amber" block disabled={busy} onClick={actions.check}>
            Check again
          </Button>
          {panel.canOverride ? (
            <Button variant="secondary" compact block disabled={busy} onClick={actions.override}>
              It&rsquo;s done, continue without a check
            </Button>
          ) : null}
        </div>
      );
    case "retry":
      return (
        <div className={styles.actions}>
          <Status badge="stop" tone="coral" title={panel.title} sentence={panel.sentence} />
          <div className={styles.compare}>
            <FrameImage className={styles.you} src={youSrc} alt="Your attempt" tag="You" />
            <FrameImage src={expertSrc} alt="Expert reference" tag="Expert" />
          </div>
          <Button variant="coral" block disabled={busy} onClick={actions.check}>
            I&rsquo;ve fixed it, check again
          </Button>
        </div>
      );
    case "stop":
      return (
        <div className={styles.actions}>
          <Status badge="stop" tone="coral" title={panel.title} sentence={panel.sentence} />
          <Button variant="coral" block disabled={busy} onClick={actions.acknowledge}>
            I&rsquo;ve made it safe
          </Button>
        </div>
      );
    case "complete":
      return null;
  }
}
