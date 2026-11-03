import type { Guide, StepOutcome } from "@apprentice/core";
import { useEffect, useReducer, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router";
import { Button, IconButton, IconLink } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Footer, Screen, TopBar } from "../../components/Screen";
import { api } from "../../lib/api";
import { cx } from "../../lib/cx";
import { plural } from "../../lib/format";
import { useResource } from "../../lib/useResource";
import styles from "./Lab.module.css";
import {
  clock,
  currentStep,
  emptyDraft,
  labReducer,
  labWarnings,
  labelsFileName,
  toRecordingLabels,
  type LabDraft,
} from "./labModel";

const OUTCOME_TEXT: Record<StepOutcome, string> = {
  done: "Done",
  wrong: "Done wrong",
  skipped: "Skipped",
};

const KEYS: Record<string, StepOutcome> = { d: "done", w: "wrong", s: "skipped" };

const draftKey = (guide: Guide, video: string) =>
  `apprentice:lab:${guide.id}:v${guide.version}:${video}`;

function loadDraft(guide: Guide, video: string): LabDraft {
  try {
    const raw = localStorage.getItem(draftKey(guide, video));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (parsed && typeof parsed === "object" && "marks" in parsed)
      return { ...emptyDraft(guide), marks: (parsed as LabDraft).marks };
  } catch {
    // A missing or unreadable draft just means starting fresh.
  }
  return emptyDraft(guide);
}

/** `/lab`: pick the guide a recording follows. */
function GuidePicker() {
  const guides = useResource("guides", api.guides);
  const ready = guides.data?.filter((g) => g.status !== "building" && g.steps.length > 0) ?? [];
  return (
    <Screen>
      <TopBar leading={<IconLink to="/" icon="back" label="Apprentice home" />} title="Eval lab" />
      <section className={styles.heading}>
        <span className="eyebrow">Eval lab</span>
        <h1>Label a recording</h1>
        <p className={styles.lead}>
          Pick the guide someone followed. You&apos;ll mark where each step ended and whether it was
          done right, so the coach can be measured on real attempts.
        </p>
      </section>
      <ul className={styles.list}>
        {ready.map((g) => (
          <li key={g.id}>
            <Link to={`/lab/${g.id}`} className={styles.pick}>
              <span className={styles.pickTitle}>{g.title}</span>
              <span className={styles.muted}>
                {plural(g.steps.length, "step")} · v{g.version}
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          </li>
        ))}
      </ul>
      {guides.data && ready.length === 0 ? (
        <p className={styles.muted}>No guides are ready yet.</p>
      ) : null}
      {guides.error ? <p className={styles.error}>{guides.error.message}</p> : null}
    </Screen>
  );
}

function Labeller({ guide }: { guide: Guide }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<{ name: string; url: string; durationS?: number }>();
  const [draft, dispatch] = useReducer(labReducer, guide, emptyDraft);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  const current = currentStep(guide, draft);
  const warnings = labWarnings(guide, draft, video?.durationS);
  const marked = Object.keys(draft.marks).length;

  useEffect(() => () => (video ? URL.revokeObjectURL(video.url) : undefined), [video]);

  useEffect(() => {
    if (!video) return;
    try {
      localStorage.setItem(draftKey(guide, video.name), JSON.stringify(draft));
    } catch {
      // Storage may be full or blocked; the draft still lives in memory.
    }
  }, [draft, guide, video]);

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideo({ name: file.name, url: URL.createObjectURL(file) });
    const saved = loadDraft(guide, file.name);
    dispatch({ type: "reset" });
    for (const [k, m] of Object.entries(saved.marks))
      if (m) {
        dispatch({ type: "mark", stepIndex: Number(k), endS: m.endS, outcome: m.outcome });
        if (m.note) dispatch({ type: "note", stepIndex: Number(k), value: m.note });
      }
  };

  const mark = (stepIndex: number, outcome: StepOutcome) => {
    const t = videoRef.current?.currentTime;
    if (t === undefined) return;
    dispatch({ type: "mark", stepIndex, endS: t, outcome });
  };

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  // D, W and S mark the current step at the playhead, for labelling at a keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const outcome = KEYS[e.key.toLowerCase()];
      if (outcome && current !== undefined && video) {
        e.preventDefault();
        mark(current, outcome);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const download = () => {
    if (!video) return;
    setError(undefined);
    try {
      const labels = toRecordingLabels(
        draft,
        { name: video.name, durationS: video.durationS ?? videoRef.current?.duration ?? 0 },
        description,
      );
      const blob = new Blob([`${JSON.stringify(labels, null, 2)}\n`], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = labelsFileName(video.name);
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the labels file");
    }
  };

  return (
    <Screen>
      <TopBar
        leading={<IconLink to="/lab" icon="back" label="Pick another guide" />}
        title="Eval lab"
      />
      <section className={styles.heading}>
        <span className="eyebrow">Label a recording · v{guide.version}</span>
        <h1>{guide.title}</h1>
        <p className={styles.lead}>
          Play the recording and mark the moment each step ends. The video stays on this device.
        </p>
      </section>

      {video ? (
        <div className={styles.player}>
          <video
            ref={videoRef}
            src={video.url}
            controls
            playsInline
            muted
            aria-label={`Recording: ${video.name}`}
            onLoadedMetadata={(e) => {
              const durationS = e.currentTarget.duration;
              setVideo((v) => (v ? { ...v, durationS } : v));
            }}
          />
        </div>
      ) : null}
      <label className={styles.file}>
        <Icon name="video" />
        {video ? `${video.name} · choose another` : "Choose a recording"}
        <input type="file" accept="video/*" onChange={choose} />
      </label>

      {video ? (
        <>
          <ol className={styles.steps}>
            {guide.steps.map((step, k) => {
              const m = draft.marks[k];
              const isCurrent = k === current;
              return (
                <li key={k} className={cx(styles.step, isCurrent && styles.current)}>
                  <div className={styles.stepHead}>
                    <span className={cx(styles.number, m && styles[m.outcome])}>
                      {m ? (
                        <Icon
                          name={
                            m.outcome === "done"
                              ? "check"
                              : m.outcome === "wrong"
                                ? "warning"
                                : "chevron"
                          }
                          size={16}
                        />
                      ) : (
                        k + 1
                      )}
                    </span>
                    <div className={styles.stepText}>
                      <span className={styles.stepTitle}>{step.title}</span>
                      {m ? (
                        <button type="button" className={styles.seek} onClick={() => seek(m.endS)}>
                          {OUTCOME_TEXT[m.outcome]} at {clock(m.endS)}
                        </button>
                      ) : (
                        <span className={styles.muted}>{step.doneWhen}</span>
                      )}
                    </div>
                    {m ? (
                      <IconButton
                        icon="close"
                        label={`Clear the mark on step ${k + 1}`}
                        onClick={() => dispatch({ type: "clear", stepIndex: k })}
                      />
                    ) : null}
                  </div>
                  {isCurrent || (m && m.outcome !== "done") ? (
                    <div className={styles.stepBody}>
                      {isCurrent ? (
                        <div
                          className={styles.marks}
                          role="group"
                          aria-label={`Mark step ${k + 1} at the playhead`}
                        >
                          <Button compact onClick={() => mark(k, "done")}>
                            Done here
                          </Button>
                          <Button compact variant="amber" onClick={() => mark(k, "wrong")}>
                            Wrong
                          </Button>
                          <Button compact variant="secondary" onClick={() => mark(k, "skipped")}>
                            Skipped
                          </Button>
                        </div>
                      ) : null}
                      {m && m.outcome !== "done" ? (
                        <input
                          className={styles.input}
                          aria-label={`What went wrong in step ${k + 1}`}
                          placeholder={
                            m.outcome === "wrong" ? "What went wrong (optional)" : "Note (optional)"
                          }
                          maxLength={300}
                          value={m.note}
                          onChange={(e) =>
                            dispatch({ type: "note", stepIndex: k, value: e.target.value })
                          }
                        />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {warnings.length ? (
            <ul className={styles.warnings} role="status">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <label className={styles.field}>
            About this recording (optional)
            <input
              className={styles.input}
              maxLength={500}
              placeholder="Who, which device, anything unusual"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <p className={styles.hint}>
            Keys: D done, W wrong, S skipped, marking the current step at the playhead.
          </p>
        </>
      ) : null}

      <Footer>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button icon="down" block disabled={!video || marked === 0} onClick={download}>
          {marked ? `Download labels (${plural(marked, "step")})` : "Download labels"}
        </Button>
      </Footer>
    </Screen>
  );
}

/** `/lab` and `/lab/:guideId`: label a trainee recording for the eval (see packages/eval). */
export function LabScreen() {
  const id = useParams().guideId;
  const guide = useResource(`guide:${id ?? ""}`, () =>
    id ? api.guide(id) : Promise.resolve(undefined),
  );
  if (!id) return <GuidePicker />;
  if (guide.data)
    return <Labeller key={`${guide.data.id}:${guide.data.version}`} guide={guide.data} />;
  return (
    <Screen>
      <TopBar
        leading={<IconLink to="/lab" icon="back" label="Pick another guide" />}
        title="Eval lab"
      />
      {guide.error ? (
        <p className={styles.error}>This guide isn&apos;t available. {guide.error.message}</p>
      ) : null}
    </Screen>
  );
}
