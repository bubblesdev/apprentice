# @apprentice/web

React + Vite PWA, built from the approved prototype (dark first, accent `#9DB8FF`, amber `#F2B65A` for "show me closer", coral `#FF7A5C` for "stop", Inter Tight and Inter, 44 px or larger touch targets). Tokens come from `@apprentice/ui` and are applied as CSS custom properties at start-up.

```bash
pnpm build                                   # builds the packages the app and API use
pnpm --filter @apprentice/api start          # API on :8787, fake Meta adapters, recorded PS1 guide
pnpm --filter @apprentice/web dev            # app on :5173
```

`APPRENTICE_FAKE_JUDGE=pass` on the API lets you walk the coach end to end without a key. `VITE_API_URL` points the app at another API.

| Screen   | Route                  | What it does                                                                                          |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Home     | `/`                    | Add a video (upload), a direct video link, or written instructions; drop a file anywhere; your guides |
| Building | `/guides/:id/building` | Live progress of the real pipeline stages and the Meta model doing each                               |
| Guide    | `/guides/:id`          | Steps with the expert frame, SAM highlight, "done when" and safety notes; start coaching              |
| Coach    | `/coach/:sessionId`    | Rear camera, step card on a glass sheet, verify-then-advance with closer, retry and stop states       |
| Report   | `/report/:sessionId`   | Score, the featured catch with before and after frames, evidence strip, share                         |

The coach talks to the API over a WebSocket (HTTP fallback). It samples frames only after the trainee says "I'm done", at the rate the server's policy sets, and stops sampling as soon as the step leaves verifying. Voice prompts use the browser's speech synthesis and can be muted; passes and stops vibrate where supported.

Logic lives in pure view models (`buildView`, `coachView`, `reportView`) with unit tests; components stay presentational.

The Guide screen's Edit mode renames, rewords, reorders and deletes steps (each keeps its expert frames and parts) and saves a new draft version; Approve marks it ready.

Manual accepts pasted text, a PDF, Markdown or text file, or a link to a help page; the server extracts the text.

Not built yet: spoken questions (Voice Transcribe), step diagrams (Muse Image).
