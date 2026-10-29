import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("label a recording in the eval lab and download RecordingLabels", async ({ page }, info) => {
  // An 8 second test pattern, made here so no video is committed.
  await mkdir(info.outputDir, { recursive: true });
  const video = join(info.outputDir, "trainee-1.webm");
  execFileSync("ffmpeg", [
    ...["-hide_banner", "-loglevel", "error", "-f", "lavfi"],
    ...["-i", "testsrc=duration=8:size=320x240:rate=10", "-c:v", "libvpx", "-y", video],
  ]);

  await page.goto("/lab");
  await page.getByRole("link", { name: /Fix sticky PlayStation buttons/ }).click();
  await page.getByText("Choose a recording").locator("input").setInputFiles(video);
  const player = page.getByLabel("Recording: trainee-1.webm");
  await expect(player).toBeVisible();
  await player.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<void>((resolve) =>
        v.readyState >= 1 ? resolve() : v.addEventListener("loadedmetadata", () => resolve()),
      ),
  );
  const at = (t: number) =>
    player.evaluate(
      (v: HTMLVideoElement, time) =>
        new Promise<void>((resolve) => {
          v.addEventListener("seeked", () => resolve(), { once: true });
          v.currentTime = time;
        }),
      t,
    );

  const marks = page.getByRole("group", { name: /at the playhead/ });
  await at(2);
  await marks.getByRole("button", { name: "Done here" }).click();
  await expect(page.getByRole("button", { name: "Done at 0:02.0" })).toBeVisible();
  await at(3.5);
  await marks.getByRole("button", { name: "Skipped" }).click();
  await at(6);
  await marks.getByRole("button", { name: "Wrong" }).click();
  await page.getByLabel("What went wrong in step 3").fill("Left one screw in");
  await expect(page.getByText(/steps have no mark and will be left out/)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download labels (3 steps)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("trainee-1.labels.json");
  const labels: unknown = JSON.parse(await readFile((await file.path()) ?? "", "utf8"));
  expect(labels).toMatchObject({
    version: 1,
    guideId: "ps1-buttons",
    video: { name: "trainee-1.webm", durationS: 8 },
    steps: [
      { stepIndex: 0, endS: 2, outcome: "done" },
      { stepIndex: 1, endS: 3.5, outcome: "skipped" },
      { stepIndex: 2, endS: 6, outcome: "wrong", note: "Left one screw in" },
    ],
  });
});
