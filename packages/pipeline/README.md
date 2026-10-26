# @apprentice/pipeline

Instructions to guide, as idempotent, versioned stages.

```
draft_steps -> refine_boundaries -> reference_frames -> ground_parts -> draw_diagrams -> Guide
 Muse Spark     Muse Spark           (no model)          SAM 3.1        Muse Image
```

| Stage               | What it does                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `draft_steps`       | Muse Spark watches the video with its audio, or reads the document text, and drafts ordered steps              |
| `refine_boundaries` | For each step, Muse Spark picks the first finished frame from dense frames (every 2 s, +/- 8 s) around its end |
| `reference_frames`  | Chooses expert frames late in each step (60%, 85%, 98%), where the finished state shows                        |
| `ground_parts`      | SAM 3.1 finds each named part in the step's latest reference frames; unfound parts are not required live       |

`runStage` stores each output under `name@vN:<sha256 of canonical input>` in an `ArtifactStore` and validates it on write and read. A rebuild reuses every stage whose input is unchanged, so a crash, a retry or a config change only pays for what changed. Bump a stage's `version` when its logic changes. Document sources skip boundary refinement and grounding.

`buildGuide(input, deps, { store, config, onProgress })` reports progress per stage for the Building screen.
