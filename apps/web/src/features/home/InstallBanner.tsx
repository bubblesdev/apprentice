import { Button, IconButton } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Card } from "../../components/Screen";
import { useInstallPrompt } from "../../lib/install";
import styles from "./Home.module.css";

/** Offers to install Apprentice on the home screen: Chrome's prompt, or Safari's share-sheet steps on iPhone. */
export function InstallBanner() {
  const { mode, install, dismiss } = useInstallPrompt();
  if (mode === "none") return null;
  return (
    <Card className={styles.install}>
      <span className={styles.installIcon} aria-hidden="true">
        <Icon name="check" size={18} strokeWidth={2.4} />
      </span>
      <span className={styles.installText}>
        <span className={styles.installTitle}>Add Apprentice to your home screen</span>
        <span className={styles.rowMeta}>
          {mode === "ios" ? (
            <>
              Tap <Icon name="share" size={14} /> Share, then Add to Home Screen.
            </>
          ) : (
            "Full screen, one tap away, camera ready."
          )}
        </span>
      </span>
      {mode === "prompt" ? (
        <Button compact onClick={() => void install()}>
          Install
        </Button>
      ) : null}
      <IconButton icon="close" label="Not now" onClick={dismiss} />
    </Card>
  );
}
