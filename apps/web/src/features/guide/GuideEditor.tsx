import type { Guide } from "@apprentice/core";
import { useReducer, useState } from "react";
import { Button, IconButton } from "../../components/Button";
import { Footer } from "../../components/Screen";
import { api } from "../../lib/api";
import { draftErrors, draftFrom, editorReducer, toRequest, type DraftStep } from "./editorModel";
import styles from "./Guide.module.css";

const FIELDS: { field: keyof Omit<DraftStep, "from">; label: string; multiline: boolean }[] = [
  { field: "title", label: "Title", multiline: false },
  { field: "instruction", label: "Instruction", multiline: true },
  { field: "doneWhen", label: "Done when", multiline: true },
  { field: "safetyNote", label: "Safety note (optional)", multiline: false },
];

interface Props {
  guide: Guide;
  onSaved: (guide: Guide) => void;
  onCancel: () => void;
}

/** Rename, reword, reorder and delete steps. Saving creates a new draft version of the guide. */
export function GuideEditor({ guide, onSaved, onCancel }: Props) {
  const [draft, dispatch] = useReducer(editorReducer, guide, draftFrom);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const errors = draftErrors(draft);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      onSaved(await api.editGuide(guide.id, toRequest(draft, guide)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };

  return (
    <>
      <div className={styles.editor}>
        <label className={styles.field}>
          Guide name
          <input
            className={`${styles.input} ${styles.titleInput}`}
            value={draft.title}
            onChange={(e) => dispatch({ type: "title", value: e.target.value })}
          />
        </label>
        <ol className={styles.steps}>
          {draft.steps.map((s, at) => (
            <li key={s.from} className={styles.editCard}>
              <div className={styles.editHeader}>
                <span className={styles.number}>{at + 1}</span>
                <IconButton
                  icon="up"
                  label={`Move step ${at + 1} up`}
                  disabled={at === 0}
                  onClick={() => dispatch({ type: "move", at, by: -1 })}
                />
                <IconButton
                  icon="down"
                  label={`Move step ${at + 1} down`}
                  disabled={at === draft.steps.length - 1}
                  onClick={() => dispatch({ type: "move", at, by: 1 })}
                />
                <IconButton
                  icon="trash"
                  label={`Delete step ${at + 1}`}
                  disabled={draft.steps.length === 1}
                  onClick={() => dispatch({ type: "remove", at })}
                />
              </div>
              {FIELDS.map(({ field, label, multiline }) => (
                <label key={field} className={styles.field}>
                  {label}
                  {multiline ? (
                    <textarea
                      className={styles.input}
                      rows={3}
                      value={s[field]}
                      onChange={(e) =>
                        dispatch({ type: "field", at, field, value: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      className={styles.input}
                      value={s[field]}
                      onChange={(e) =>
                        dispatch({ type: "field", at, field, value: e.target.value })
                      }
                    />
                  )}
                </label>
              ))}
            </li>
          ))}
        </ol>
      </div>
      <Footer>
        {(error ?? errors[0]) ? (
          <p className={styles.error} role="alert">
            {error ?? errors[0]}
          </p>
        ) : null}
        <div className={styles.footerRow}>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || errors.length > 0}>
            {saving ? "Saving" : "Save changes"}
          </Button>
        </div>
      </Footer>
    </>
  );
}
