# Local handoff: 27 to 28 Oct 2026

Run on James's Mac with the real Meta key, branch `claude/fervent-archimedes-ybta5u`. Paste this into the cloud session to continue.

## What ran, and what it cost

About **$3.58** of the $10 budget, every paid call cached in `.cache/meta` (re-runs are free).

| Step                                                                                 | Cost                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Format probe (Spark, Wonder, Image, then Voice twice)                                | about $0.03                                               |
| PS1 guide build (7.7 min video, 10 steps, 30 references, 10 diagrams, safety review) | $0.58 (Spark $0.23, Wonder $0.13, SAM $0.13, Image $0.10) |
| Coached runs over HTTP and through the web app (video file as the camera)            | about $0.20                                               |
| Four more guide builds (collected videos)                                            | about $1.40                                               |
| Synthetic eval: baseline on 90 cases, then after one prompt change                   | $0.79 + $0.77                                             |

Measured against the targets:

- Guide build: $0.58 for a 7.7-minute video, $0.25 to $0.45 for shorter ones (target $1 or less).
- Judge check: about $0.0093 each. A coached step needs about two, so about $0.02 to $0.03 per coaching minute (target $0.05).
- The Muse Wonder run audit adds about $0.07 per finished run.

## Probe results (ADR 0007 updated)

- **Muse Spark, Muse Wonder:** Responses API as assumed. Reasoning tokens are billed inside `output_tokens` (a one-word reply used 135).
- **Muse Image:** an `image_generation_call` item with base64 `result`; `extractImages` already parses it.
- **Muse Voice Transcribe:** not `/audio/transcriptions` (404). The real endpoint is `POST /asr/transcribe`, multipart with a JSON `request` part (`model`, `audioEncoding: "WAV"`, `mode: "PUSH_TO_TALK"`) and a WAV `audio` part. It returns `{ sessionId, transcript, audioDurationMs, turns }`. The client now uses it, and a spoken question was transcribed and answered live.

## Bugs fixed (with tests)

| Commit  | Fix                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22910c7 | Voice Transcribe uses the real endpoint and reads `transcript`. The probe read non-JSON bodies twice; it now reads once and has `--only=<model>`.                                                    |
| 737804d | A copied `.env.example` crashed the API (`DATABASE_URL=` failed `min(1)`). The API, worker and eval CLI now drop blank variables. Lint skips `.cache/`.                                              |
| 80b6f5d | Collector against the real Internet Archive: file lengths like `10:41` failed the whole search, and the retired CC public domain dedication (`/licenses/publicdomain/`) was refused. Both now parse. |
| fef18b6 | `collect --only commons:123,archive:item` downloads exactly the items picked from a dry run.                                                                                                         |
| 4bd586c | Judge prompt tuned (below); results in `docs/eval/results-2026-10-27.md`.                                                                                                                            |

## Smoke test notes

- The real app works end to end with live models: build, approve, coach, spoken question, report, Muse Wonder audit. It was driven in a phone-sized Chromium with a video file as the camera; James couldn't use his phone at night.
- **Latency:** a live check took about 15 to 20 s in the web app, mostly Muse Spark reasoning (about 1,500 output tokens per verdict).
- **Unverifiable steps:** some steps can't be confirmed from a still frame, for example "remove the bottom screws" when the console sits screws-down. The judge said `not_yet` four times. The prompt change partly fixes this.
- **SAM grounding is weak:** it located only 0 to 5 parts per guide (for example 3 of 25 for PS1, 1 of 24 for SAIL). When required parts aren't found, the coach asks "show me closer" even when the judge agrees.
- One Muse Image diagram failed on the lawn tractor guide (4 of 5 drawn). As designed, it did not fail the guide.

## Collected videos (`.cache/videos`, credited in `ATTRIBUTION.md`, not committed)

- "Lawn tractor tire wont inflate, try this!" (CC BY 3.0)
- "Minor Car Repair Series Vol. I" (CC BY 3.0)
- "Montering av Finslipen" (CC BY-SA 4.0, 14 s, only 2 cases)
- "SAIL Pump Assembly" (CC BY 2.5)

The Gerber toilet repair on Internet Archive returned HTTP 401 for its file, so it was skipped. Commons search relevance is weak (it matches descriptions), so pick from the dry-run list.

## Eval numbers (synthetic, optimistic and label-noisy; see the results doc)

| 90 cases, passConfidence 0.8 | Before | After the prompt change |
| ---------------------------- | ------ | ----------------------- |
| Pass rate (target 85%)       | 67%    | 76%                     |
| Catch rate (target 90%)      | 82%    | 79%                     |
| False passes (target 0)      | 10     | 12                      |

At 0.9, the new prompt gives 58% / 88% / 7, against 52% / 88% / 7 before. **Chosen:** keep the new prompt and leave `passConfidence` at 0.8 until gold data. The candidate is 0.9.

## Gold eval: not done yet (needs James)

How to record about 5 attempts:

1. Pick one built guide whose job you can actually do at home. Use a simple, safe job with visible end states, for example a desk fan's front grille off, cleaned and back on.
2. Film each attempt in one take on your phone, from above or the side, with the parts in frame and good light. Keep each attempt to 1 to 3 minutes.
3. Make about 5 attempts: 2 done correctly; 2 with one step deliberately skipped (a different step each time); 1 with a wrong part or wrong orientation.
4. Copy the videos to `~/Servers/apprentice/samples/gold/`.
5. Open `http://localhost:5173/lab`, pick the guide, load each video, mark where each step ended and whether it was done, skipped or wrong, then download the labels JSON next to the video.
6. Then run `set from-labels`, `run --cap 1 --yes-spend` (about $0.01 per case) and `report`, and sweep `passConfidence`.

## Fixes made on 28 Oct (code only, not yet measured live)

- **Judge, brand rule:** parts are judged by kind, position and orientation, not by brand or model. In the cross-video eval a Micron SSD was called `wrong` against an SK hynix one.
- **Judge, reasoning level:** `JUDGE_REASONING_EFFORT` (minimal, low, medium, high) sets Muse Spark's `reasoning.effort` on step checks only. It is unset by default until measured.
- **Parts:** the coach now requires only the parts SAM found in the expert's finished frame (the last reference). A part seen only earlier, like a battery that was removed, is no longer required.
- **"Show me":** the draft prompt asks for `check_view` when the finished state is only visible from another side. It is kept as `Step.showMe`, can be edited, and becomes the coach's closer request ("Turn it over so I can see the bottom").
- **Safety review:** caution is now only for real risks a beginner might miss, not for looking, lifting, placing or sliding ordinary parts.
- **Air fryer guide** (in-memory API, saved to `.cache/eval/airfryer.guide.json`): step 5 now says to put the plate back the same way up. The needless cautions on steps 3 to 5 are cleared.

## Open problems

1. Live check latency is about 15 to 20 s. Try `reasoning: { effort: "low" }` on the judge call. It's one change, measured on the same 90 cases for cost, latency and accuracy.
2. Some steps can't be verified from a still. The draft or safety stage could add a "show me" hint ("flip it to show the bottom"), so the coach asks for the right view instead of saying not finished.
3. SAM grounding finds few parts. Try shorter concept nouns, or ground from the step's parts list with box prompts from Muse Spark. The coach should not require ungrounded parts.
4. The synthetic sets' "start" frames are noisy labels for short steps. Consider sampling "earlier" cases only from two or more steps back.
5. Ask Meta's Voice API for `languageBias` per trainee later (accents).

## What I'd do next

1. James records the gold set (above); tune `passConfidence` on it.
2. Run the judge with low reasoning effort (latency and cost), as a single change with a before and after.
3. Fix SAM grounding (open problem 3), then re-measure "show me closer" rates.
4. Build the demo guide for the 3-minute video on a job James can film, and rehearse from cache.
