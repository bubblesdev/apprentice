import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";
import styles from "./Sheet.module.css";

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet on the native <dialog>: focus is trapped, Escape and the backdrop close it. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={styles.body}>
        <div className={styles.grabber} aria-hidden="true" />
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  );
}
