import { useState, type CSSProperties } from "react";
import type { Box } from "@apprentice/core";
import { cx } from "../lib/cx";
import styles from "./FrameImage.module.css";
import { Icon } from "./Icon";

interface FrameImageProps {
  src: string | undefined;
  alt: string;
  /** Highlight from SAM 3.1, in source pixels. */
  box?: Box | undefined;
  tag?: string;
  className?: string | undefined;
  style?: CSSProperties;
}

/** A video frame with an optional part highlight. Falls back to a quiet placeholder when unavailable. */
export function FrameImage({ src, alt, box, tag, className, style }: FrameImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src !== undefined && !failed;
  return (
    <div className={cx(styles.frame, className)} style={style}>
      {showImage ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className={styles.placeholder} role="img" aria-label={alt}>
          <Icon name="scan" size={28} strokeWidth={1.6} />
        </div>
      )}
      {showImage && box ? (
        <div
          className={styles.box}
          style={{
            left: `${(box.x1 / box.w) * 100}%`,
            top: `${(box.y1 / box.h) * 100}%`,
            width: `${((box.x2 - box.x1) / box.w) * 100}%`,
            height: `${((box.y2 - box.y1) / box.h) * 100}%`,
          }}
        />
      ) : null}
      {tag ? <span className={styles.tag}>{tag}</span> : null}
    </div>
  );
}
