import { expect, test } from "@playwright/test";

test.describe("Apprentice end to end", () => {
  test("home lists the recorded guide and offers three ways to add instructions", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /What are we\s*fixing today\?/ })).toBeVisible();
    for (const name of ["Video", "Link", "Manual"])
      await expect(page.getByRole("button", { name })).toBeVisible();
    await expect(page.getByText("Fix sticky PlayStation buttons")).toBeVisible();
    await page.getByRole("button", { name: "Manual" }).click();
    await expect(page.getByRole("radio", { name: "Web page" })).toBeVisible();
  });

  test("written instructions become a guide through the Building screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Manual" }).click();
    await page
      .getByLabel("Paste the instructions")
      .fill("1. Unplug the kettle.\n2. Fill with vinegar and water.\n3. Rinse three times.");
    await page.getByLabel("Name").fill("Descale a kettle");
    await page.getByRole("button", { name: "Build the guide" }).click();
    await expect(page).toHaveURL(/\/building$/);
    await expect(page.getByRole("heading", { name: "Your guide is ready" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Reading the instructions")).toBeVisible();
    await page.getByRole("link", { name: "Review your guide" }).click();
    await expect(page.getByRole("heading", { name: "Descale a kettle" })).toBeVisible();
  });

  test("edit and approve a guide", async ({ page }) => {
    await page.goto("/guides/ps1-buttons");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Move step 2 up" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Draft · v2/)).toBeVisible();
    await expect(page.locator("ol > li").first()).toContainText("Remove bottom screws");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/Approved · v2/)).toBeVisible();
  });

  test("coach a full run: briefing, verify, pass, every step, report with review", async ({
    page,
  }) => {
    await page.goto("/guides/ps1-buttons");
    await page.getByRole("button", { name: "Start coaching" }).click();
    await expect(page.getByText("Before you start")).toBeVisible();
    const total = Number(
      (await page.getByText(/Step 1 of \d+/).textContent())?.match(/of (\d+)/)?.[1],
    );
    for (let i = 1; i <= total; i++) {
      const begin = page.getByRole("button", { name: "Start this step" });
      const check = page.getByRole("button", { name: /done, check it/ });
      await expect(begin.or(check)).toBeVisible();
      if (await begin.isVisible()) await begin.click();
      await check.click();
      await expect(page.getByText("Looks right")).toBeVisible({ timeout: 15_000 });
      await page
        .getByRole("button", { name: i === total ? "See your report" : "Next step" })
        .click();
    }
    await expect(page.getByRole("heading", { name: "Job done right" })).toBeVisible();
    await expect(page.getByText("Review of this run")).toBeVisible();
    await expect(page.getByText("Rules, no model called")).toBeVisible();
  });

  test("ask a typed question while coaching", async ({ page }) => {
    await page.goto("/guides/ps1-buttons");
    await page.getByRole("button", { name: "Start coaching" }).click();
    await page.getByRole("button", { name: "Start this step" }).click();
    await page.getByRole("button", { name: "Ask a question" }).click();
    await page.getByLabel("Type a question").fill("What does done look like?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText(/This step is done when/)).toBeVisible();
  });

  test("end a run early and see an honest partial report", async ({ page }) => {
    await page.goto("/guides/ps1-buttons");
    await page.getByRole("button", { name: "Start coaching" }).click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByRole("heading", { name: /0 of \d+ steps verified/ })).toBeVisible();
  });

  test("share a guide as a coaching link and QR code, and open it", async ({ page }) => {
    await page.goto("/guides/ps1-buttons");
    await page.getByRole("button", { name: "Share guide" }).click();
    await expect(page.getByRole("img", { name: /QR code for .*\/c\/ps1-buttons/ })).toBeVisible();
    await expect(page.getByText(/\/c\/ps1-buttons$/)).toBeVisible();
    await page.screenshot({ path: "test-results/share-sheet.png" });

    await page.goto("/c/ps1-buttons");
    await expect(
      page.getByRole("heading", { name: "Fix sticky PlayStation buttons" }),
    ).toBeVisible();
    await expect(page.getByText(/needs? a safety check/)).toBeVisible();
    await page.screenshot({ path: "test-results/coach-link.png" });
    await page.getByRole("button", { name: "Start coaching" }).click();
    await expect(page).toHaveURL(/\/coach\//);
    await expect(page.getByRole("button", { name: "Start this step" })).toBeVisible();
  });
});
