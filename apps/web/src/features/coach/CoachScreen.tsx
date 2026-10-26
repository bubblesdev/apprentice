import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { IconButton } from "../../components/Button";
import { FrameImage } from "../../components/FrameImage";
import { api, referenceFrameUrl } from "../../lib/api";
import { cx } from "../../lib/cx";
import { speak, stopSpeaking, vibrate } from "../../lib/device";
import { useResource } from "../../lib/useResource";
import { useCamera, type CapturedFrame } from "./camera";
import styles from "./Coach.module.css";
import { CoachPanel } from "./CoachPanel";
import { coachView } from "./coachView";
import { useCoachSession } from "./useCoachSession";
import { useSampler } from "./useSampler";

const VOICE_KEY = "apprentice.voice";

function readVoicePreference(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function CoachScreen() {
  const sessionId = useParams().sessionId ?? "";
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera(videoRef);
  const { update, error, send, sendFrames } = useCoachSession(sessionId);
  const guideId = update?.session.guideId;
  const guide = useResource(`guide:${guideId ?? ""}`, () =>
    guideId ? api.guide(guideId) : Promise.resolve(undefined),
  );
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(readVoicePreference);
  const [lastFrame, setLastFrame] = useState<CapturedFrame>();

  const onCaptured = useCallback((frame: CapturedFrame) => {
    setLastFrame((previous) => {
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      return frame;
    });
  }, []);
  useSampler(videoRef, update, sendFrames, onCaptured);

  const steps = guide.data?.steps ?? [];
  const view = update && steps.length ? coachView(update, steps) : undefined;
  const step = update ? steps[update.session.stepIndex] : undefined;
  const refT = step?.referenceTimesS.at(-1);
  const expertSrc = guideId && refT !== undefined ? referenceFrameUrl(guideId, refT) : undefined;

  // Speak each new prompt once; buzz on a pass and on a stop.
  const spokenKey = view
    ? `${update?.session.stepIndex}:${update?.session.state}:${update?.decision?.sentence ?? ""}`
    : "";
  useEffect(() => {
    if (!view?.spoken) return;
    if (voice) speak(view.spoken);
    if (view.panel.kind === "pass") vibrate(20);
    if (view.panel.kind === "stop" || view.panel.kind === "retry") vibrate([60, 40, 60]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the prompt, not on every render
  }, [spokenKey]);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    if (update?.session.state === "complete") navigate(`/report/${sessionId}`, { replace: true });
  }, [update?.session.state, navigate, sessionId]);

  const act =
    (event: "begin" | "check" | "next" | "acknowledge" | "override" | "end") => async () => {
      setBusy(true);
      await send({ type: event });
      setBusy(false);
    };

  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    if (!next) stopSpeaking();
    try {
      localStorage.setItem(VOICE_KEY, next ? "on" : "off");
    } catch {
      // Private mode: the preference just isn't remembered.
    }
  };

  const end = async () => {
    stopSpeaking();
    await send({ type: "end" });
    navigate(`/report/${sessionId}`, { replace: true });
  };

  return (
    <div
      className={cx(
        styles.coach,
        view?.tone === "amber" && styles.amber,
        view?.tone === "coral" && styles.coral,
      )}
    >
      <video
        ref={videoRef}
        className={styles.video}
        playsInline
        muted
        aria-label="Live camera view of your work"
      />
      <div className={styles.shade} />
      {camera === "live" ? <div className={styles.frameGuide} aria-hidden="true" /> : null}
      {camera === "denied" || camera === "unavailable" ? (
        <p className={styles.message}>
          {camera === "denied"
            ? "Camera access is off. Allow it in your browser settings so I can check your work."
            : "No camera found. Open Apprentice on your phone to be coached."}
        </p>
      ) : null}

      <div className={styles.top}>
        <div className={styles.topRow}>
          <IconButton icon="close" label="End session" glass onClick={() => void end()} />
          {view ? (
            <span className={styles.pill}>
              Step {view.stepNumber} of {view.total}
            </span>
          ) : null}
          <IconButton
            icon={voice ? "speaker" : "muted"}
            label={voice ? "Mute voice prompts" : "Turn on voice prompts"}
            aria-pressed={voice}
            glass
            onClick={toggleVoice}
          />
        </div>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Guide progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((view?.progress ?? 0) * 100)}
        >
          <span style={{ width: `${(view?.progress ?? 0) * 100}%` }} />
        </div>
      </div>

      <section className={styles.sheet} aria-live="polite">
        {step ? (
          <div className={styles.instructionRow}>
            <div className={styles.instructionText}>
              {/* Recorded drafts may carry no separate instruction; then the title is the instruction. */}
              {step.instruction !== step.title ? (
                <span className={styles.stepTitle}>{step.title}</span>
              ) : null}
              <span className={styles.instruction}>{step.instruction}</span>
            </div>
            {guide.data?.source.kind !== "document" ? (
              <FrameImage
                className={styles.expert}
                src={expertSrc}
                alt="Expert reference for this step"
                tag="Expert"
              />
            ) : null}
          </div>
        ) : (
          <span className={styles.statusSentence}>{error ?? "Getting your session ready"}</span>
        )}
        {view ? (
          <CoachPanel
            panel={view.panel}
            busy={busy}
            youSrc={lastFrame?.previewUrl}
            expertSrc={expertSrc}
            actions={{
              begin: act("begin"),
              check: act("check"),
              next: act("next"),
              acknowledge: act("acknowledge"),
              override: act("override"),
            }}
          />
        ) : null}
        {error && view ? (
          <span className={styles.statusSentence} role="alert">
            {error}
          </span>
        ) : null}
      </section>
    </div>
  );
}
