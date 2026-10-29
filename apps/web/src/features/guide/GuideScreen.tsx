import type { Guide, Step, StepInsight } from "@apprentice/core";
import { useId, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button, IconButton, IconLink } from "../../components/Button";
import { FrameImage } from "../../components/FrameImage";
import { Icon } from "../../components/Icon";
import { Footer, Screen, TopBar } from "../../components/Screen";
import { ShareSheet } from "../share/ShareSheet";
import { GuideEditor } from "./GuideEditor";
import { api, evidenceFrameUrl, referenceFrameUrl } from "../../lib/api";
import { cx } from "../../lib/cx";
import { aboutMinutes, clock, plural, uniqueParts } from "../../lib/format";
import { useResource } from "../../lib/useResource";
import styles from "./Guide.module.css";

/** The best highlight for a step's last reference frame: a part sighted at that exact time. */
function highlight(step: Step, t: number) {
  for (const part of step.parts) {
    const sighting = part.sightings.find((s) => s.t === t) ?? part.sightings.at(-1);
    if (sighting) return { box: sighting.box, label: part.name };
  }
  return undefined;
}

function StepItem({
  guide,
  step,
  open,
  onToggle,
  insight,
}: {
  guide: Guide;
  step: Step;
  open: boolean;
  onToggle: () => void;
  insight: StepInsight | undefined;
}) {
  const detailId = useId();
  const [view, setView] = useState<"photo" | "diagram">(
    guide.source.kind === "document" ? "diagram" : "photo",
  );
  const t = step.referenceTimesS.at(-1);
  const hl = t === undefined ? undefined : highlight(step, t);
  const isVideo = guide.source.kind !== "document";
  return (
    <li className={cx(styles.step, open && styles.open)}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className={styles.number}>{step.index + 1}</span>
        <span className={styles.stepText}>
          <span className={styles.stepTitle}>{step.title}</span>
          {step.parts.length ? (
            <span className={styles.stepParts}>{step.parts.map((p) => p.name).join(" · ")}</span>
          ) : null}
          {insight?.flagged ? (
            <span className={styles.struggle}>
              {insight.runs - insight.firstTry} of {insight.runs} trainees needed another try
            </span>
          ) : null}
        </span>
        {isVideo ? <span className={styles.time}>{clock(step.startS)}</span> : null}
      </button>
      {open ? (
        <div id={detailId} className={styles.detail}>
          {step.diagramKey ? (
            <div
              className={styles.viewToggle}
              role="radiogroup"
              aria-label="Show the expert photo or the diagram"
            >
              {(["photo", "diagram"] as const).map((v) => (
                <label key={v} className={cx(styles.viewOption, view === v && styles.viewOptionOn)}>
                  <input
                    type="radio"
                    name={`view-${step.index}`}
                    checked={view === v}
                    onChange={() => setView(v)}
                  />
                  {v === "photo" ? "Expert photo" : "Diagram"}
                </label>
              ))}
            </div>
          ) : null}
          {view === "diagram" && step.diagramKey ? (
            <img
              className={styles.diagram}
              src={evidenceFrameUrl(step.diagramKey)}
              alt={`Diagram of step ${step.index + 1}: ${step.title}`}
            />
          ) : isVideo && t !== undefined ? (
            <FrameImage
              className={styles.reference}
              src={referenceFrameUrl(guide.id, t)}
              alt={`Expert frame for step ${step.index + 1}${hl ? `, ${hl.label} highlighted` : ""}`}
              box={hl?.box}
              tag={`Expert · ${clock(t)}`}
            />
          ) : null}
          {step.instruction !== step.title ? (
            <p className={styles.doneText}>{step.instruction}</p>
          ) : null}
          <div className={styles.done}>
            <span className={styles.doneLabel}>Done when</span>
            <span className={styles.doneText}>{step.doneWhen}</span>
          </div>
          {step.safety.note ? <p className={styles.stepWarning}>{step.safety.note}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export function GuideScreen() {
  const id = useParams().id ?? "";
  const navigate = useNavigate();
  const loaded = useResource(`guide:${id}`, () => api.guide(id));
  const [edited, setEdited] = useState<Guide>();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const insights = useResource(`insights:${id}`, () => api.insights(id).catch(() => undefined));
  const guide = { ...loaded, data: edited ?? loaded.data };
  const [open, setOpen] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const g = guide.data;

  if (g?.status === "building") return <Navigate to={`/guides/${id}/building`} replace />;

  const first = g?.steps[0];
  const last = g?.steps.at(-1);
  const meta = g
    ? [
        plural(g.steps.length, "step"),
        first && last && last.endS > first.startS ? aboutMinutes(last.endS - first.startS) : "",
        uniqueParts(g.steps, 2).join(", "),
        insights.data?.runs ? plural(insights.data.runs, "run") : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const warned = g?.steps.find((s) => s.safety.level !== "none" && s.safety.note);

  const start = async () => {
    setStarting(true);
    setError(undefined);
    try {
      const session = await api.startSession(id);
      navigate(`/coach/${session.session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start coaching");
      setStarting(false);
    }
  };

  const approve = async () => {
    setError(undefined);
    try {
      setEdited(await api.approve(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve");
    }
  };

  const view = (
    <>
      {guide.error && !g ? <p className={styles.error}>{guide.error.message}</p> : null}
      {g ? (
        <>
          <section className={styles.heading}>
            <h1>{g.title}</h1>
            <span className={styles.meta}>{meta}</span>
            <span className={styles.status}>
              <span className={cx(styles.chip, g.status === "approved" && styles.chipApproved)}>
                {g.status === "approved" ? "Approved" : "Draft"} · v{g.version}
              </span>
              {g.status === "draft" ? (
                <Button variant="secondary" compact onClick={() => void approve()}>
                  Approve
                </Button>
              ) : null}
            </span>
          </section>
          {warned ? (
            <div className={styles.warning} role="note">
              <Icon name="warning" size={18} />
              <span>
                Step {warned.index + 1}: {warned.safety.note}
              </span>
            </div>
          ) : null}
          <ol className={styles.steps}>
            {g.steps.map((s) => (
              <StepItem
                key={s.index}
                guide={g}
                step={s}
                open={open === s.index}
                onToggle={() => setOpen(open === s.index ? -1 : s.index)}
                insight={
                  insights.data?.guideVersion === g.version
                    ? insights.data.steps[s.index]
                    : undefined
                }
              />
            ))}
          </ol>
          {g.source.attribution ? (
            <p className={styles.attribution}>Source: {g.source.attribution}.</p>
          ) : null}
        </>
      ) : null}
      <Footer>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button
          icon="scan"
          block
          disabled={!g || g.steps.length === 0 || starting}
          onClick={() => void start()}
        >
          {starting ? "Starting" : "Start coaching"}
        </Button>
      </Footer>
    </>
  );

  return (
    <Screen>
      <TopBar
        leading={<IconLink to="/" icon="back" label="Back to home" />}
        title={editing ? "Editing" : ""}
        trailing={
          editing ? undefined : (
            <span style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" compact disabled={!g} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <IconButton
                icon="share"
                label="Share guide"
                disabled={!g}
                onClick={() => setSharing(true)}
              />
            </span>
          )
        }
      />
      {editing && g ? (
        <GuideEditor
          guide={g}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEdited(saved);
            setEditing(false);
          }}
        />
      ) : (
        view
      )}
      {g ? (
        <ShareSheet
          open={sharing}
          onClose={() => setSharing(false)}
          guideId={g.id}
          title={g.title}
        />
      ) : null}
    </Screen>
  );
}
