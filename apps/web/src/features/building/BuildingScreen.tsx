import { useParams } from "react-router";
import { ButtonLink, IconLink } from "../../components/Button";
import { FrameImage } from "../../components/FrameImage";
import { Card, Footer, Screen, TopBar } from "../../components/Screen";
import { StageMark } from "../../components/Spinner";
import { ApiError, api, referenceFrameUrl } from "../../lib/api";
import { cx } from "../../lib/cx";
import { clock, plural } from "../../lib/format";
import { useResource } from "../../lib/useResource";
import styles from "./Building.module.css";
import { buildPhase, buildRows } from "./buildView";

export function BuildingScreen() {
  const id = useParams().id ?? "";
  const guide = useResource(`guide:${id}`, () => api.guide(id), {
    pollMs: 1000,
    stopWhen: (g) => g.status !== "building",
  });
  const build = useResource(
    `build:${id}`,
    () =>
      api
        .build(id)
        .catch((e: unknown) =>
          e instanceof ApiError && e.status === 404 ? undefined : Promise.reject(e),
        ),
    {
      pollMs: 1000,
      stopWhen: (s) =>
        Boolean(s?.error) ||
        s?.stages.some((x) => x.stage === "review_safety" && x.state !== "running") === true,
    },
  );

  const phase = buildPhase(guide.data, build.data);
  const isDocument = guide.data?.source.kind === "document";
  const rows = buildRows(build.data, phase, isDocument);
  const steps = guide.data?.steps ?? [];
  const parts = new Set(
    steps.flatMap((s) => s.parts.filter((p) => p.sightings.length > 0).map((p) => p.name)),
  );
  const notes = steps.filter((s) => s.safety.level !== "none").length;
  const frames = steps
    .flatMap((s) => (s.referenceTimesS.length ? [s.referenceTimesS.at(-1) ?? 0] : []))
    .slice(0, 4);
  const source = guide.data?.source;

  const headline =
    phase === "ready"
      ? "Your guide is ready"
      : phase === "failed"
        ? "I couldn't build this guide"
        : "Building your guide";
  const sub =
    phase === "ready"
      ? [
          plural(steps.length, "step"),
          parts.size ? `${plural(parts.size, "part")} located` : "",
          notes ? plural(notes, "safety note") : "",
        ]
          .filter(Boolean)
          .join(", ") + "."
      : phase === "failed"
        ? (build.data?.error ?? "Something went wrong.")
        : "I'm watching it the way an apprentice would.";

  return (
    <Screen>
      <TopBar
        leading={<IconLink to="/" icon="back" label="Back to home" />}
        title={
          source
            ? [source.title, source.durationS ? clock(source.durationS) : ""]
                .filter(Boolean)
                .join(" · ")
            : ""
        }
      />
      <section className={styles.heading} aria-live="polite">
        <h1>{headline}</h1>
        <p className={phase === "failed" ? styles.error : undefined}>{sub}</p>
      </section>

      <Card>
        <ol className={styles.stages}>
          {rows.map((r) => (
            <li key={r.stage} className={cx(styles.stage, r.state === "pending" && styles.pending)}>
              <StageMark state={r.state} />
              <span className={styles.stageText}>
                <span className={styles.stageLabel}>{r.label}</span>
                <span className={styles.stageDetail}>
                  {r.state === "skipped"
                    ? (r.detail ?? "Not needed for written instructions")
                    : r.detail}
                </span>
              </span>
              {r.model ? <span className={styles.model}>{r.model}</span> : null}
              <span className="visually-hidden">{r.state}</span>
            </li>
          ))}
        </ol>
      </Card>

      {phase === "ready" && frames.length > 0 ? (
        <section className={styles.found}>
          <h2 className="eyebrow">Steps found</h2>
          <div className={styles.strip}>
            {frames.map((t, i) => (
              <FrameImage
                key={t}
                src={referenceFrameUrl(id, t)}
                alt={`Expert frame, step ${i + 1}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Footer>
        {phase === "ready" ? (
          <ButtonLink to={`/guides/${id}`} block>
            Review your guide
          </ButtonLink>
        ) : phase === "failed" ? (
          <ButtonLink to="/" variant="secondary" block>
            Back to guides
          </ButtonLink>
        ) : (
          <div className={styles.wait}>Usually under a minute for a 5-minute video</div>
        )}
      </Footer>
    </Screen>
  );
}
