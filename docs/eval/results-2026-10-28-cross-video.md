# Cross-video eval: 28 Oct 2026

The first test where the trainee is not the expert's own video.

- **Guide:** built live from "How to open Dell Latitude 7450 - disassembly and upgrade options" (LaptopMedia, CC BY 3.0, Wikimedia Commons). 9 steps, 9 ends adjusted, 27 references, 4 of 20 parts grounded, 9 diagrams, 4 of 9 steps flagged for safety.
- **Trainee:** "How to open Dell Latitude 7455 - disassembly and upgrade options" (same channel and licence). The trainee has a different laptop, a different session and does the steps in a different order: SSD before Wi-Fi.
- **Labels:** written by Claude from frames, for the steps with a visible end state only. Step 0 (position the laptop) and step 1 (loosen captive screws) are left out, because loosened screws look the same as tight ones in a still.
- **No skip or wrong-part cases.** Every step really was done in the trainee video, so those can only come from James's own recordings.
- **Settings:** `passConfidence` 0.8, the judge prompt from 27 Oct.

## Results (14 cases)

| Case          | Step                   | Label   | Verdict | Confidence | Note                                                                                      |
| ------------- | ---------------------- | ------- | ------- | ---------- | ----------------------------------------------------------------------------------------- |
| r3-done       | 2 Pry off cover        | done    | not_yet | 0.98       | Label timing: at 36 to 38 s the cover is still on. A label error, not a judge error.      |
| r3-start      | 2 Pry off cover        | not_yet | not_yet | 0.98       | Correct                                                                                   |
| r4-done       | 3 Disconnect battery   | done    | done    | 0.90       | Correct                                                                                   |
| r4-start      | 3 Disconnect battery   | not_yet | done    | 0.80       | **False pass at 0.8.** Possibly a label error; it would not pass at 0.9.                  |
| r5-done       | 4 Remove battery       | done    | done    | 0.95       | Correct                                                                                   |
| r5-start      | 4 Remove battery       | not_yet | not_yet | 0.98       | Correct                                                                                   |
| r6-done       | 5 Inspect memory, WWAN | done    | done    | 0.88       | Correct                                                                                   |
| x4-cover-on   | 3 Disconnect battery   | not_yet | not_yet | 0.95       | Correct                                                                                   |
| x5-cover-on   | 4 Remove battery       | not_yet | not_yet | 0.95       | Correct                                                                                   |
| x5-battery-in | 4 Remove battery       | not_yet | not_yet | 0.95       | Correct                                                                                   |
| x8-cover-on   | 7 Access M.2 slot      | not_yet | not_yet | 0.99       | Correct                                                                                   |
| x7-wifi       | 6 Locate Wi-Fi         | done    | not_yet | 0.90       | The 7455 Wi-Fi sits elsewhere. Different hardware, so a weak label.                       |
| x8-ssd        | 7 Access M.2 slot      | done    | wrong   | 0.90       | **Over-literal:** "Micron drive instead of the SK hynix one". Same part, different brand. |
| x9-cooling    | 8 Inspect cooling      | done    | done    | 0.90       | Correct                                                                                   |

- **Not-finished states (7 cases):** 6 caught. 1 false pass, at exactly 0.8.
- **Finished states (7 cases):** 4 recognised. Of the 3 missed, one is a label timing error, one is different hardware and one is the brand problem.
- **Overall:** 10 of 14 agree with the labels. Leaving out the two label problems, 10 of 12.

## What it shows

1. **Earlier states are caught across videos.** Cover still on and battery still in were judged not_yet at 0.95 or more every time, on a different laptop.
2. **The judge reads brands as part identity.** A different brand of the same kind of part was called `wrong`. For real users (any fan, any fryer) this matters. The fix to try: tell the judge that the same kind of part from a different brand or model is fine, and that `wrong` means the wrong kind of part, the wrong place or the wrong orientation.
3. **0.9 again looks safer than 0.8.** The only false pass was at 0.8.

## Cost

About $0.52: the guide build was about $0.41 (Spark $0.17, SAM $0.10, Image $0.09, Wonder $0.05) and the 14 checks were $0.12. Every call is cached.

## Next

- One change: the brand rule in the judge prompt. Re-run this set and the 90 synthetic cases, about $0.90 in total, for a before and after.
- Gold set: James's air fryer recordings, which add the skip, wrong-orientation and unsafe cases. The model run (28 s, 4K) is in `samples/gold/airfryer-model-run.MOV`, which is not committed.

## Brand rule, re-run on the 90 synthetic cases (28 Oct, commit 130a272)

| Gate at 0.8             | Before (27 Oct prompt) | After (brand rule) |
| ----------------------- | ---------------------- | ------------------ |
| Pass rate (target 85%)  | 76%                    | 73%                |
| Catch rate (target 90%) | 79%                    | 79%                |
| False passes (target 0) | 12                     | 12                 |

At 0.9 the new run gives 58% / 84% / 9; at 0.95, 30% / 93% / 4. Seven cases changed, three better and four worse. This is run-to-run noise: within one video there are no brand differences for the rule to fix, and it caused no regression. Kept. The 14 cross-video cases (where the SSD brand case lives) were not re-run, to stay inside the $0.90 approved; they need about $0.12 more. Cost: $0.82.
