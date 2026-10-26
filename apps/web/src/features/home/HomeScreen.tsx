import type { Guide } from "@apprentice/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { FrameImage } from "../../components/FrameImage";
import { Icon, type IconName } from "../../components/Icon";
import { Card, Screen, TopBar } from "../../components/Screen";
import { api, referenceFrameUrl } from "../../lib/api";
import { cx } from "../../lib/cx";
import { aboutMinutes, plural } from "../../lib/format";
import { useResource } from "../../lib/useResource";
import { AddInstructionsSheet, type Pending, type SourceChoice } from "./AddInstructions";
import styles from "./Home.module.css";

const TILES: { choice: SourceChoice; label: string; icon: IconName }[] = [
  { choice: "video", label: "Video", icon: "video" },
  { choice: "link", label: "Link", icon: "link" },
  { choice: "manual", label: "Manual", icon: "document" },
];

const FROM: Record<Guide["source"]["kind"], string> = {
  video: "from video",
  video_url: "from a link",
  document: "from a manual",
};

function guideMeta(guide: Guide): string {
  if (guide.status === "building") return "Building the guide";
  const last = guide.steps.at(-1);
  const span = last ? last.endS - (guide.steps[0]?.startS ?? 0) : 0;
  return [
    plural(guide.steps.length, "step"),
    span > 0 ? aboutMinutes(span) : "",
    FROM[guide.source.kind],
  ]
    .filter(Boolean)
    .join(" · ");
}

function GuideRow({ guide }: { guide: Guide }) {
  const first = guide.steps.find((s) => s.referenceTimesS.length > 0);
  const t = first?.referenceTimesS.at(-1);
  const to = guide.status === "building" ? `/guides/${guide.id}/building` : `/guides/${guide.id}`;
  return (
    <Link to={to} className={styles.row}>
      <FrameImage
        className={styles.thumb}
        src={t === undefined ? undefined : referenceFrameUrl(guide.id, t)}
        alt=""
      />
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{guide.title}</span>
        <span className={styles.rowMeta}>{guideMeta(guide)}</span>
      </span>
      <Icon name="chevron" size={18} style={{ color: "var(--color-muted)" }} />
    </Link>
  );
}

/** Lets a file dropped anywhere on the page start the right flow. */
function useFileDrop(onFile: (file: File) => void | Promise<void>): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void onFile(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onFile]);
  return dragging;
}

export function HomeScreen() {
  const guides = useResource("guides", api.guides, {
    pollMs: 3000,
    stopWhen: (list) => list.every((g) => g.status !== "building"),
  });
  const [pending, setPending] = useState<Pending>();
  const dropFile = useCallback(async (file: File) => {
    if (file.type.startsWith("video/")) setPending({ choice: "video", file });
    else if (/\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith("text/")) {
      setPending({ choice: "manual", file, text: await file.text() });
    }
  }, []);
  const dragging = useFileDrop(dropFile);

  return (
    <Screen>
      <TopBar
        leading={
          <span className={styles.brand}>
            <span className={styles.logo}>
              <Icon name="check" size={16} strokeWidth={2.4} />
            </span>
            Apprentice
          </span>
        }
      />
      <section className={styles.hero}>
        <h1>
          What are we
          <br />
          fixing today?
        </h1>
        <p>Give me any instructions. I&apos;ll turn them into a guide and watch you do it.</p>
      </section>

      <Card className={cx(styles.add, dragging && styles.dragging)}>
        <div className={styles.addHeader}>
          <h2 className="eyebrow">Add instructions</h2>
          <span className={styles.hint}>Drop a file anywhere</span>
        </div>
        <div className={styles.tiles}>
          {TILES.map((t) => (
            <button
              key={t.choice}
              type="button"
              className={styles.tile}
              onClick={() => setPending({ choice: t.choice })}
            >
              <Icon name={t.icon} size={26} strokeWidth={1.8} />
              {t.label}
            </button>
          ))}
        </div>
        <p className={styles.caption}>
          A video of someone doing the job, a direct video link, or written instructions in Markdown
          or plain text.
        </p>
      </Card>

      <section className={styles.list} aria-labelledby="your-guides">
        <h2 id="your-guides" className="eyebrow">
          Your guides
        </h2>
        {guides.error && !guides.data ? (
          <p className={styles.error}>
            Can&apos;t reach Apprentice right now. {guides.error.message}
          </p>
        ) : null}
        {guides.data?.map((g) => (
          <GuideRow key={g.id} guide={g} />
        ))}
        <div className={styles.empty}>Your next guide appears here</div>
      </section>

      <AddInstructionsSheet pending={pending} onClose={() => setPending(undefined)} />
    </Screen>
  );
}
