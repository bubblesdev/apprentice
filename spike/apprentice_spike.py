"""Apprentice feasibility spike: can SAM 3.1 track parts through a real job video,
and can Muse Spark split the job into steps and catch a skipped step?

Usage:
  python3 -I apprentice_spike.py <expert.mp4> "part one" "part two" ...

Key: META_MODEL_API_KEY env var, else "metaModelApi" in the JSON file named by
META_KEY_FILE. The key is never printed.
Outputs go to spike/out/<video name>/.
"""
import base64, json, os, re, subprocess, sys, time
import requests
from PIL import Image, ImageDraw

API = "https://api.meta.ai/v1"
SPARK = "muse-spark-1.3"


def api_key():
    k = os.environ.get("META_MODEL_API_KEY")
    if k:
        return k
    p = os.environ.get("META_KEY_FILE", "")
    k = json.load(open(p)).get("metaModelApi") if p and os.path.exists(p) else None
    if not k:
        sys.exit("No Meta key: set META_MODEL_API_KEY (or META_KEY_FILE pointing at a JSON with metaModelApi)")
    return k if isinstance(k, str) else k.get("apiKey") or k.get("key")


H = {"Authorization": f"Bearer {api_key()}"}


def faststart(src, dst):
    # SAM wants H.264 MP4; re-encode small and with the index up front.
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vf", "scale=-2:720,fps=10",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac",
                    "-movflags", "+faststart", dst], check=True)


def upload(path):
    with open(path, "rb") as f:
        r = requests.post(f"{API}/files", headers=H, files={"file": f}, data={"purpose": "user_data"}, timeout=600)
    r.raise_for_status()
    return r.json()["id"]


def responses(body, timeout=900):
    r = requests.post(f"{API}/responses", headers={**H, "Content-Type": "application/json"}, json=body, timeout=timeout)
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code}: {r.text[:500]}")
    return r.json()


def output_text(resp):
    out = []
    for item in resp.get("output", []):
        for c in item.get("content", []) or []:
            if c.get("type") in ("output_text", "text"):
                out.append(c.get("text", ""))
    return "\n".join(out) or resp.get("output_text", "")


BOX = re.compile(r"(\d+)<\|box;([^|]*)\|>")


def parse_sam(text):
    """frame -> list of {id, x1,y1,x2,y2,w,h,c}. Masks are skipped for the spike."""
    frames = {}
    for line in text.splitlines():
        m = re.match(r"<(\d+)f>(.*)", line.strip())
        if not m:
            continue
        objs = []
        for oid, fields in BOX.findall(m.group(2)):
            kv = dict(p.split("=", 1) for p in fields.split(";") if "=" in p)
            objs.append({"id": int(oid), **{k: float(v) for k, v in kv.items()}})
        frames[int(m.group(1))] = objs
    return frames


def sam_track(file_id, concept):
    t = time.time()
    resp = responses({"model": "sam-3.1", "stream": False,
                      "metadata": {"mask_encoding": "one_bit", "include_confidence": "true"},
                      "input": [{"role": "user", "content": [
                          {"type": "input_text", "text": concept},
                          {"type": "input_video", "file_id": file_id}]}]})
    return parse_sam(output_text(resp)), time.time() - t


def frame_png(video, idx, fps, out):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{idx / fps:.3f}", "-i", video,
                    "-frames:v", "1", out], check=True)


def draw(png, objs, label, out):
    im = Image.open(png).convert("RGB")
    d = ImageDraw.Draw(im)
    for o in objs:
        sx, sy = im.width / o["w"], im.height / o["h"]
        d.rectangle([o["x1"] * sx, o["y1"] * sy, o["x2"] * sx, o["y2"] * sy], outline=(255, 60, 60), width=4)
        d.text((o["x1"] * sx + 4, o["y1"] * sy + 4), f'{label}#{o["id"]} {o.get("c", 0):.2f}', fill=(255, 255, 0))
    im.save(out)


def spark_steps(file_id):
    prompt = ("You are documenting a hands-on job from this video (frames and audio). Split it into the "
              "ordered steps a beginner must follow. For each step return start_s, end_s, title, "
              "parts_and_tools (short noun phrases), visible_check (what must be visible when the step "
              "is done correctly), and warning. Reply with JSON only: {\"steps\":[...]}")
    resp = responses({"model": SPARK, "input": [{"role": "user", "content": [
        {"type": "input_text", "text": prompt}, {"type": "input_video", "file_id": file_id}]}]})
    txt = output_text(resp)
    return json.loads(txt[txt.find("{"): txt.rfind("}") + 1])


def spark_check(steps, frames_b64):
    prompt = ("These frames are from a trainee doing the same job, in time order. Expert steps: "
              + json.dumps(steps) + " For each expert step, say done, skipped, wrong or unclear, with "
              "the frame number that proves it and one sentence why. JSON only: {\"verdicts\":[...]}")
    content = [{"type": "input_text", "text": prompt}] + [
        {"type": "input_image", "image_url": f"data:image/jpeg;base64,{b}"} for b in frames_b64]
    txt = output_text(responses({"model": SPARK, "input": [{"role": "user", "content": content}]}))
    return json.loads(txt[txt.find("{"): txt.rfind("}") + 1])


def main():
    src, concepts = sys.argv[1], sys.argv[2:]
    name = os.path.splitext(os.path.basename(src))[0]
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", name)
    os.makedirs(out, exist_ok=True)
    vid = os.path.join(out, "expert.mp4")
    faststart(src, vid)
    fps = eval(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                        "stream=r_frame_rate", "-of", "csv=p=0", vid]).decode().strip())
    fid = upload(vid)
    report = {"video": src, "fps": fps, "sam": {}}

    # 1. SAM 3.1 tracking per part
    for c in concepts:
        frames, secs = sam_track(fid, c)
        ids = sorted({o["id"] for objs in frames.values() for o in objs})
        report["sam"][c] = {"frames_with_hits": len(frames), "distinct_ids": ids, "seconds": round(secs, 1)}
        json.dump(frames, open(os.path.join(out, f"sam_{c.replace(' ', '_')}.json"), "w"))
        print(f"SAM '{c}': {len(frames)} frames with hits, ids {ids}, {secs:.1f}s", flush=True)
        for f in sorted(frames)[:: max(1, len(frames) // 4)][:4]:
            png = os.path.join(out, f"frame_{f}.png")
            try:
                frame_png(vid, f, fps, png)
                draw(png, frames[f], c, os.path.join(out, f"sam_{c.replace(' ', '_')}_{f}.png"))
            except Exception as e:
                print(f"  could not draw frame {f}: {e}", flush=True)

    # 2. Muse Spark splits the job into steps
    steps = spark_steps(fid)["steps"]
    report["steps"] = steps
    print(f"Spark found {len(steps)} steps:", [s.get("title") for s in steps])

    # 3. Simulated trainee: same video with one middle step cut out; can Spark catch it?
    if len(steps) >= 3:
        skip = steps[len(steps) // 2]
        report["skipped_step"] = skip.get("title")
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                             "-of", "csv=p=0", vid]).decode())
        times = [t for t in [i * dur / 16 for i in range(16)] if not (skip["start_s"] <= t <= skip["end_s"])]
        b64 = []
        for i, t in enumerate(times):
            p = os.path.join(out, f"trainee_{i}.jpg")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", vid, "-frames:v",
                            "1", "-vf", "scale=-2:480", p], check=True)
            b64.append(base64.b64encode(open(p, "rb").read()).decode())
        report["verdicts"] = spark_check(steps, b64)["verdicts"]
        print("Skipped on purpose:", skip.get("title"))
        print(json.dumps(report["verdicts"], indent=1)[:3000])

    json.dump(report, open(os.path.join(out, "report.json"), "w"), indent=1)
    print("Report:", os.path.join(out, "report.json"))


if __name__ == "__main__":
    main()
