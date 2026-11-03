import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { coachLink, downloadText, qrSvg, shareLink, slug } from "../../lib/share";
import styles from "./Share.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  guideId: string;
  title: string;
}

/**
 * Share a guide as a coaching link and a QR code. Scanning the code opens the guide's coach
 * landing, so it can go on a product box, a workbench or a manual's first page.
 */
export function ShareSheet({ open, onClose, guideId, title }: Props) {
  const url = coachLink(guideId, window.location.origin);
  const svg = useMemo(() => qrSvg(url), [url]);
  const [status, setStatus] = useState("");

  const share = async () => {
    const result = await shareLink({
      title: `Coach me: ${title}`,
      text: `Do "${title}" with a live coach.`,
      url,
    });
    setStatus(
      result === "copied"
        ? "Link copied"
        : result === "failed"
          ? "Couldn't share. Copy the link instead."
          : "",
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
    } catch {
      setStatus("Couldn't copy. Select the link and copy it.");
    }
  };

  return (
    <Sheet open={open} title="Share this guide" onClose={onClose}>
      {/* The SVG is generated locally from our own URL; it contains no user markup. */}
      <div
        className={styles.qr}
        role="img"
        aria-label={`QR code for ${url}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className={styles.caption}>
        Scan to start coaching. Print it for a workbench or a product box.
      </p>
      <p className={styles.link}>{url}</p>
      <div className={styles.actions}>
        <Button icon="share" onClick={() => void share()}>
          Share link
        </Button>
        <Button variant="secondary" onClick={() => void copy()}>
          Copy link
        </Button>
      </div>
      <Button
        variant="secondary"
        compact
        block
        onClick={() => downloadText(`apprentice-${slug(title)}-qr.svg`, svg, "image/svg+xml")}
      >
        Download QR code
      </Button>
      <p className={styles.status} aria-live="polite">
        {status}
      </p>
    </Sheet>
  );
}
