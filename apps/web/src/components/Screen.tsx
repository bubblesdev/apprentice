import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./Screen.module.css";

/** A phone-width column with safe-area padding; centred on larger screens. */
export function Screen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <main className={cx(styles.screen, className)}>{children}</main>;
}

/** Top row: leading control, optional centre text, trailing controls. */
export function TopBar({
  leading,
  title,
  trailing,
}: {
  leading?: ReactNode;
  title?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={styles.bar}>
      {leading ?? <span />}
      {title ? <span className={styles.barTitle}>{title}</span> : null}
      {trailing ?? <span />}
    </div>
  );
}

/** Primary actions pinned to the bottom, over a fade. */
export function Footer({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <div className={cx(styles.card, className)}>{children}</div>;
}
