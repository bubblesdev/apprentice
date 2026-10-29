# More laptop pairs and edited mistakes: 29 Oct 2026

James asked for no more home recordings, so this uses downloaded videos only. Mistakes come from Muse Image edits of real trainee frames.

## What was tested

- **New cross-video pairs** (LaptopMedia, CC BY 3.0, Wikimedia Commons; credited in each set's `attribution`):
  - Dell Latitude 7450 guide (from 28 Oct), Dell Latitude 3550 as the trainee: 5 cases.
  - New guide from "How to open HP ProBook 460 G11" (8 steps, 24 references, 3 of 20 parts grounded, 8 diagrams), HP ProBook 440 G11 as the trainee: 7 cases.
- **Edited mistakes:** a real frame, edited by Muse Image to show one mistake, keeping everything else. Each edit was checked by eye and one that did not show its mistake was dropped. Every mistake has a "no change" control: the same frame sent through Muse Image with no change, to check that re-rendering alone does not make the coach fail a step.
  - Air fryer (James's own clip; the trainee frames come from the expert video itself, so these are optimistic): plate upside down, plug back in the socket, basket left open, plate still in the basket.
  - Dell 7455 trainee: battery put back, SSD removed, SSD unseated.
  - HP 440 trainee: battery put back.
- **Settings:** `passConfidence` 0.8, the judge with the brand rule (commit 130a272).

## Results (30 cases)

| Group                  | Cases | Agree | Missed                                                    |
| ---------------------- | ----- | ----- | --------------------------------------------------------- |
| Cross-video, Dell 3550 | 5     | 5     |                                                           |
| Cross-video, HP 440    | 7     | 6     | `hp-ram-open`: shield half lifted, judged not_yet at 0.90 |
| Edited mistakes        | 8     | 6     | **2 false passes** (below)                                |
| No-change controls     | 6     | 6     | `af-ctrl-4` done at only 0.75, so the coach asks closer   |

- **Not-finished states, real frames:** 5 of 5 caught.
- **Finished states, real frames:** 6 of 7 recognised. The miss may be a label a second too early.
- **Edited mistakes:** 6 of 8 caught. `d-ssd-loose` was called not_yet instead of wrong, which still stops the trainee.
- **Controls:** 6 of 6 judged done, so Muse Image re-rendering alone does not make steps fail. One sits below the 0.8 gate.

### The two false passes

1. **`af-upside`, plate upside down: done at 0.90.** The judge said the plate rests flat in the basket and never checked which way up it was. The expert's finished frames show the plate mostly hidden under a hand, so there was little to compare against. This is a real weakness: orientation mistakes are a headline case for the demo. A 0.9 threshold would not stop it either.
2. **`d-bat-back`, battery put back: done at 0.97.** The edit drew a small black pad over the touchpad, not a full-width battery, and the judge saw an empty bay. This is a weak edit, not a clear judge error. The HP version of the same mistake, with a convincing full-width battery, was caught at 0.96.

## What it shows

1. **Across laptop models the coach is strong on clear state changes** (cover on or off, battery in or out): 11 of 12 real cross-video cases agree, with no false passes.
2. **Orientation is the gap.** "Done" is judged from where a part is, not which way round it is, when the reference frame doesn't show the part clearly.
3. **Edited frames work as a mistake source** when each edit is checked by eye. 12 of 14 edits showed the intended mistake.

## Next

- One change for orientation: when a step's finished state depends on which way a part faces, the guide stores what the right side looks like ("feet down, holes up"), and the judge must confirm it or say unclear. Re-run these 30 cases for a before and after.
- More edited mistakes on orientation and wrong parts, to measure the change on more than one case.

## Cost

About $0.77: the HP guide about $0.40, 16 Muse Image edits $0.16, 30 checks $0.21. Every call is cached in `.cache/meta`.
