import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Sheet } from "../../components/Sheet";
import styles from "./Coach.module.css";
import type { QuestionState } from "./useQuestion";

interface Props {
  open: boolean;
  state: QuestionState;
  onClose: () => void;
  onRecord: () => void;
  onStop: () => void;
  onAsk: (text: string) => void;
}

/** Ask about the current step by voice (tap to talk, tap to send) or by typing. */
export function QuestionSheet({ open, state, onClose, onRecord, onStop, onAsk }: Props) {
  const [text, setText] = useState("");
  const busy = state.kind === "thinking";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onAsk(text.trim());
      setText("");
    }
  };

  return (
    <Sheet open={open} title="Ask about this step" onClose={onClose}>
      <button
        type="button"
        className={styles.talk}
        data-recording={state.kind === "recording"}
        aria-pressed={state.kind === "recording"}
        disabled={busy}
        onClick={state.kind === "recording" ? onStop : onRecord}
      >
        <Icon name="mic" size={28} strokeWidth={1.8} />
        {state.kind === "recording" ? "Listening. Tap to send" : "Tap and ask"}
      </button>
      <div className={styles.answer} aria-live="polite">
        {state.kind === "thinking" ? (
          <p className={styles.statusSentence}>
            {state.question ? `"${state.question}"` : "Listening back"}. Thinking
          </p>
        ) : null}
        {state.kind === "answered" ? (
          <>
            <p className={styles.statusSentence}>&ldquo;{state.question}&rdquo;</p>
            <p className={styles.answerText}>{state.answer}</p>
          </>
        ) : null}
        {state.kind === "error" ? (
          <p className={styles.statusSentence} role="alert">
            {state.message}
          </p>
        ) : null}
      </div>
      <form className={styles.askForm} onSubmit={submit}>
        <input
          className={styles.askInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type a question"
          aria-label="Type a question"
          maxLength={500}
        />
        <Button type="submit" compact disabled={busy || !text.trim()}>
          Ask
        </Button>
      </form>
    </Sheet>
  );
}
