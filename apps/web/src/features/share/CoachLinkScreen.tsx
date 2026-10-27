import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, IconLink } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Footer, Screen, TopBar } from "../../components/Screen";
import { api } from "../../lib/api";
import { aboutMinutes, plural } from "../../lib/format";
import { useResource } from "../../lib/useResource";
import styles from "./Share.module.css";

/**
 * Where a shared coaching link or QR code lands: what the job is, what the coach will do, and one
 * button. Starting needs a tap anyway, because the browser only asks for the camera after one.
 */
export function CoachLinkScreen() {
  const id = useParams().guideId ?? "";
  const navigate = useNavigate();
  const guide = useResource(`guide:${id}`, () => api.guide(id));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const g = guide.data;
  const ready = g && g.status !== "building" && g.steps.length > 0;
  const first = g?.steps[0];
  const last = g?.steps.at(-1);
  const minutes =
    first && last && last.endS > first.startS ? aboutMinutes(last.endS - first.startS) : "";
  const stops = g?.steps.filter((s) => s.safety.level === "stop").length ?? 0;

  const start = async () => {
    setStarting(true);
    setError(undefined);
    try {
      const update = await api.startSession(id);
      navigate(`/coach/${update.session.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start coaching");
      setStarting(false);
    }
  };

  return (
    <Screen className={styles.landing}>
      <TopBar leading={<IconLink to="/" icon="back" label="Apprentice home" />} />
      {guide.error && !g ? (
        <p className={styles.error}>This guide isn&apos;t available. {guide.error.message}</p>
      ) : null}
      {g ? (
        <>
          <section className={styles.hero}>
            <span className="eyebrow">Live coach</span>
            <h1>{g.title}</h1>
            <p>{[plural(g.steps.length, "step"), minutes].filter(Boolean).join(" · ")}</p>
          </section>
          <ul className={styles.points}>
            <li>
              <Icon name="scan" />
              Point your phone at your work. I check each step against the expert before you move
              on.
            </li>
            <li>
              <Icon name="zoom" />
              If I can&apos;t see well enough, I&apos;ll ask you to show me closer instead of
              guessing.
            </li>
            <li>
              <Icon name="mic" />
              Ask me a question any time, out loud or by typing.
            </li>
          </ul>
          {stops ? (
            <div className={styles.warning} role="note">
              <Icon name="warning" size={18} />
              {stops === 1
                ? "1 step needs a safety check before you start it."
                : `${stops} steps need a safety check before you start them.`}
            </div>
          ) : null}
          {g.source.attribution ? (
            <p className={styles.fine}>Guide made from: {g.source.attribution}.</p>
          ) : null}
        </>
      ) : null}
      <Footer>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button icon="scan" block disabled={!ready || starting} onClick={() => void start()}>
          {starting
            ? "Starting"
            : g?.status === "building"
              ? "This guide is still being built"
              : "Start coaching"}
        </Button>
      </Footer>
    </Screen>
  );
}
