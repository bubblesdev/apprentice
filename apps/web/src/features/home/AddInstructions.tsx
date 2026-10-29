import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Sheet } from "../../components/Sheet";
import { api } from "../../lib/api";
import { cx } from "../../lib/cx";
import { photoAsJpeg, utf8Base64, videoDuration } from "../../lib/device";
import styles from "./Home.module.css";

export type SourceChoice = "video" | "link" | "manual";

const VIDEO_TYPES = "video/mp4,video/quicktime,video/webm";
const MAX_DOCUMENT_CHARS = 200_000;
const MAX_PAGES = 12;

const titleFromFile = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim() || "Untitled job";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      {label}
      {children}
    </label>
  );
}

/** Shared submit flow: runs `create`, then opens the Building screen for the new guide. */
function useCreate() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (create: () => Promise<string>) => {
    setBusy(true);
    setError(undefined);
    try {
      const guideId = await create();
      navigate(`/guides/${guideId}/building`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function VideoForm({ initialFile }: { initialFile?: File | undefined }) {
  const [file, setFile] = useState<File | undefined>(initialFile);
  const [title, setTitle] = useState(initialFile ? titleFromFile(initialFile.name) : "");
  const [attribution, setAttribution] = useState("");
  const { busy, error, run } = useCreate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    void run(async () => {
      const [durationS, uploaded] = await Promise.all([videoDuration(file), api.upload(file)]);
      const media = uploaded.media;
      const { guideId } = await api.createGuide({
        source: {
          kind: "video",
          title: title.trim() || titleFromFile(file.name),
          location: media.url,
          ...(durationS ? { durationS } : {}),
          ...(attribution.trim() ? { attribution: attribution.trim() } : {}),
        },
        media,
        frameSource: media,
      });
      return guideId;
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.file}>
        <input
          type="file"
          accept={VIDEO_TYPES}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFile(f);
            if (f && !title) setTitle(titleFromFile(f.name));
          }}
        />
        <Icon name="video" />
        {file ? file.name : "Choose a video of someone doing the job"}
      </label>
      <Field label="Name">
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Fix a sticky button"
        />
      </Field>
      <Field label="Source and licence (shown with the guide)">
        <input
          className={styles.input}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          placeholder="Filmed by me, or CC BY 3.0, Wikimedia Commons"
        />
      </Field>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" block disabled={!file || busy}>
        {busy ? "Uploading" : "Build the guide"}
      </Button>
    </form>
  );
}

function LinkForm() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [attribution, setAttribution] = useState("");
  const { busy, error, run } = useCreate();
  const valid = /^https?:\/\/\S+$/i.test(url.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const link = url.trim();
    void run(async () => {
      const { guideId } = await api.createGuide({
        source: {
          kind: "video_url",
          title: title.trim() || "Video from a link",
          location: link,
          ...(attribution.trim() ? { attribution: attribution.trim() } : {}),
        },
        media: { kind: "url", url: link },
      });
      return guideId;
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <Field label="Direct link to a video file (MP4, MOV or WebM)">
        <input
          className={styles.input}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/how-to.mp4"
        />
      </Field>
      <Field label="Name">
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Fix a sticky button"
        />
      </Field>
      <Field label="Source and licence (shown with the guide)">
        <input
          className={styles.input}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
        />
      </Field>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" block disabled={!valid || busy}>
        {busy ? "Starting" : "Build the guide"}
      </Button>
    </form>
  );
}

type ManualMode = "paste" | "photos" | "file" | "link";

const MODES: { mode: ManualMode; label: string }[] = [
  { mode: "paste", label: "Paste" },
  { mode: "photos", label: "Photos" },
  { mode: "file", label: "File" },
  { mode: "link", label: "Web page" },
];

function ManualForm({
  initialText,
  initialFile,
}: {
  initialText?: string | undefined;
  initialFile?: File | undefined;
}) {
  const [mode, setMode] = useState<ManualMode>(initialFile ? "file" : "paste");
  const [text, setText] = useState(initialText ?? "");
  const [file, setFile] = useState<File | undefined>(initialFile);
  const [url, setUrl] = useState("");
  const [pages, setPages] = useState<File[]>([]);
  const [title, setTitle] = useState(initialFile ? titleFromFile(initialFile.name) : "");
  const { busy, error, run } = useCreate();
  const isPdf = file?.type === "application/pdf" || /\.pdf$/i.test(file?.name ?? "");
  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_DOCUMENT_CHARS;
  const linkValid = /^https?:\/\/\S+$/i.test(url.trim());
  const ready =
    mode === "paste"
      ? Boolean(trimmed) && !tooLong
      : mode === "photos"
        ? pages.length > 0 && pages.length <= MAX_PAGES
        : mode === "file"
          ? Boolean(file) && (isPdf || (Boolean(trimmed) && !tooLong))
          : linkValid;

  const chooseFile = async (f: File | undefined) => {
    setFile(f);
    if (!f) return;
    if (!title) setTitle(titleFromFile(f.name));
    if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) setText(await f.text());
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    void run(async () => {
      const name = title.trim() || (mode === "link" ? "Help page" : "Written instructions");
      if (mode === "link") {
        const link = url.trim();
        return (
          await api.createGuide({
            source: { kind: "document", title: name, location: link },
            media: { kind: "url", url: link },
          })
        ).guideId;
      }
      if (mode === "photos") {
        const uploaded = [];
        for (const page of pages) uploaded.push((await api.upload(await photoAsJpeg(page))).media);
        const [first] = uploaded;
        if (!first) throw new Error("Add a photo of each page");
        return (
          await api.createGuide({
            source: {
              kind: "document",
              title: title.trim() || "Printed manual",
              location: first.kind === "url" ? first.url : "photos",
            },
            media: first,
            pages: uploaded,
          })
        ).guideId;
      }
      if (mode === "file" && file && isPdf) {
        const { media } = await api.upload(
          new File([file], file.name, { type: "application/pdf" }),
        );
        return (
          await api.createGuide({
            source: { kind: "document", title: name, location: media.url },
            media,
          })
        ).guideId;
      }
      const { guideId } = await api.createGuide({
        source: { kind: "document", title: name, location: file?.name ?? "pasted.md" },
        media: {
          kind: "url",
          url: `data:text/markdown;base64,${utf8Base64(trimmed)}`,
          mime: "text/markdown",
        },
        documentText: trimmed,
      });
      return guideId;
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.segmented} role="radiogroup" aria-label="How to add the instructions">
        {MODES.map((m) => (
          <label key={m.mode} className={cx(styles.segment, mode === m.mode && styles.segmentOn)}>
            <input
              type="radio"
              name="manual-mode"
              value={m.mode}
              checked={mode === m.mode}
              onChange={() => setMode(m.mode)}
            />
            {m.label}
          </label>
        ))}
      </div>
      {mode === "paste" ? (
        <Field label="Paste the instructions">
          <textarea
            className={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="1. Unplug the console. 2. Remove the six screws..."
          />
        </Field>
      ) : null}
      {mode === "photos" ? (
        <label className={styles.file}>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setPages(Array.from(e.target.files ?? []))}
          />
          <Icon name="document" />
          {pages.length === 0
            ? "Take or choose a photo of each page"
            : `${pages.length} ${pages.length === 1 ? "page" : "pages"}, in the order chosen`}
        </label>
      ) : null}
      {mode === "photos" && pages.length > MAX_PAGES ? (
        <p className={styles.error}>Choose up to {MAX_PAGES} pages.</p>
      ) : null}
      {mode === "file" ? (
        <label className={styles.file}>
          <input
            type="file"
            accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
          <Icon name="document" />
          {file ? file.name : "Choose a PDF, Markdown or text file"}
        </label>
      ) : null}
      {mode === "link" ? (
        <Field label="Link to a help page, PDF or text file">
          <input
            className={styles.input}
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://support.example.com/descale-your-kettle"
          />
        </Field>
      ) : null}
      <Field label="Name">
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Replace a bike brake pad"
        />
      </Field>
      {tooLong && mode !== "link" && !isPdf ? (
        <p className={styles.error}>That is longer than 200,000 characters.</p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" block disabled={!ready || busy}>
        {busy ? "Starting" : "Build the guide"}
      </Button>
    </form>
  );
}

const TITLES: Record<SourceChoice, string> = {
  video: "Add a video",
  link: "Add a video link",
  manual: "Add written instructions",
};

export interface Pending {
  choice: SourceChoice;
  file?: File;
  text?: string;
}

export function AddInstructionsSheet({
  pending,
  onClose,
}: {
  pending: Pending | undefined;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={pending !== undefined}
      title={pending ? TITLES[pending.choice] : ""}
      onClose={onClose}
    >
      {pending?.choice === "video" ? <VideoForm initialFile={pending.file} /> : null}
      {pending?.choice === "link" ? <LinkForm /> : null}
      {pending?.choice === "manual" ? (
        <ManualForm initialText={pending.text} initialFile={pending.file} />
      ) : null}
    </Sheet>
  );
}
