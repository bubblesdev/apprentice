"""Spike 2: per-step check against the expert's reference frames.

For each expert step, Muse Spark sees the step text, 3 expert reference frames
(the end state matters most) and 3 trainee frames, and answers: is this step
done correctly? Three cases per step, using different moments of the same
video as the "trainee":
  correct : trainee frames taken from the same step at other moments
  skipped : trainee frames from the NEXT step (they jumped ahead)
  earlier : trainee frames from two steps back (not started yet)
Only Muse Spark is called (no SAM), so a full run costs cents.

Usage: python3 -I step_check.py out/ps1_buttons
"""
import base64, json, os, subprocess, sys
from apprentice_spike import responses, output_text, SPARK


def grab(video, t, path):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", video,
                    "-frames:v", "1", "-vf", "scale=-2:360", "-q:v", "4", path], check=True)
    return base64.b64encode(open(path, "rb").read()).decode()


def frames(video, step, fracs, tag, out):
    s, e = float(step["start_s"]), float(step["end_s"])
    return [grab(video, s + f * (e - s), os.path.join(out, f"{tag}_{i}.jpg")) for i, f in enumerate(fracs)]


def check(step, expert, trainee):
    prompt = (
        "You are a strict workshop instructor. The expert's step is:\n" + json.dumps(step) +
        "\nThe first 3 images show the EXPERT during and at the end of this step. The last 3 images "
        "show the TRAINEE right now. Decide whether the trainee has completed THIS step correctly. "
        "Compare the state of the parts, not the hands or camera angle. If the trainee is clearly "
        "past this step but there is no evidence this step was done, say skipped. If they have not "
        "reached it, say not_yet. JSON only: {\"verdict\":\"done|skipped|not_yet|wrong\","
        "\"confidence\":0-1,\"evidence\":\"one sentence naming what you saw\"}")
    content = [{"type": "input_text", "text": prompt}]
    for b in expert + trainee:
        content.append({"type": "input_image", "image_url": f"data:image/jpeg;base64,{b}"})
    resp = responses({"model": SPARK, "input": [{"role": "user", "content": content}]})
    txt = output_text(resp)
    usage = resp.get("usage", {})
    return json.loads(txt[txt.find("{"): txt.rfind("}") + 1]), usage


def main():
    run = sys.argv[1]
    video = os.path.join(run, "expert.mp4")
    steps = json.load(open(os.path.join(run, "report.json")))["steps"]
    out = os.path.join(run, "stepcheck")
    os.makedirs(out, exist_ok=True)
    expected = {"correct": "done", "skipped": "skipped", "earlier": "not_yet"}
    rows, tokens = [], [0, 0]
    for k in range(2, len(steps) - 1):
        step = steps[k]
        expert = frames(video, step, [0.3, 0.7, 0.98], f"s{k}_expert", out)
        cases = {"correct": frames(video, step, [0.15, 0.5, 0.88], f"s{k}_ok", out),
                 "skipped": frames(video, steps[k + 1], [0.3, 0.6, 0.95], f"s{k}_skip", out),
                 "earlier": frames(video, steps[k - 2], [0.3, 0.6, 0.95], f"s{k}_early", out)}
        for case, trainee in cases.items():
            v, u = check(step, expert, trainee)
            tokens[0] += u.get("input_tokens", 0)
            tokens[1] += u.get("output_tokens", 0)
            ok = v.get("verdict") == expected[case]
            rows.append({"step": k + 1, "title": step.get("title"), "case": case, "expected": expected[case],
                         **v, "pass": ok})
            print(f"step {k + 1} {case:8} -> {v.get('verdict'):8} {'PASS' if ok else 'FAIL'}  {v.get('evidence', '')[:90]}",
                  flush=True)
    passed = sum(r["pass"] for r in rows)
    cost = tokens[0] / 1e6 * 1.25 + tokens[1] / 1e6 * 4.25
    summary = {"passed": passed, "total": len(rows), "input_tokens": tokens[0], "output_tokens": tokens[1],
               "est_cost_usd": round(cost, 3)}
    for case in expected:
        sub = [r for r in rows if r["case"] == case]
        summary[case] = f'{sum(r["pass"] for r in sub)}/{len(sub)}'
    print(json.dumps(summary))
    json.dump({"summary": summary, "rows": rows}, open(os.path.join(out, "results.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
