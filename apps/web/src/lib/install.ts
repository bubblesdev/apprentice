import { useEffect, useState } from "react";

/** Chrome's install event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "apprentice.install.dismissed";

export type InstallMode = "prompt" | "ios" | "none";

/** iPhone and iPad Safari have no install event; the person adds the app from the share sheet. */
export function installModeFor(
  userAgent: string,
  standalone: boolean,
  hasPromptEvent: boolean,
): InstallMode {
  if (standalone) return "none";
  if (hasPromptEvent) return "prompt";
  const ios =
    /iphone|ipad|ipod/i.test(userAgent) ||
    (/macintosh/i.test(userAgent) && /mobile/i.test(userAgent));
  const safari = /safari/i.test(userAgent) && !/crios|fxios|edgios/i.test(userAgent);
  return ios && safari ? "ios" : "none";
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether and how to offer "Install Apprentice", until installed or dismissed. */
export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent>();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mode =
    installed || dismissed
      ? "none"
      : installModeFor(navigator.userAgent, standalone, event !== undefined);

  const install = async () => {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setEvent(undefined);
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode: it will be offered again next visit.
    }
  };

  return { mode, install, dismiss };
}
