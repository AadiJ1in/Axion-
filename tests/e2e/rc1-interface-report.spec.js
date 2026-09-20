import { test, expect } from "@playwright/test";

test("patient Report tab opens the existing reporting page", async ({ page }) => {
  await page.goto("/?journey-playtest=1");
  await expect.poll(async () => page.locator(".prototype-strip").textContent()).toContain("Demo environment");

  const nav = page.locator('.topbar .nav[data-ui-patient-nav="true"]');
  await expect(nav.locator('button[data-nav]')).toHaveCount(5);
  await expect(nav.locator('[data-nav="patient-report"]')).toBeVisible();
  await expect(nav.locator('[data-nav="patient-report"]')).toHaveText(/Report/i);
  await nav.locator('[data-nav="patient-report"]').click();

  await expect(page.locator(".patient-report-page")).toBeVisible();
  await expect(page.locator(".patient-report-page h1")).toContainText("Tell your physical therapist");
  await expect(page.locator("#patient-report-form")).toBeVisible();
  await expect(page.locator("#patient-report-assignment")).toBeVisible();
  await expect(page.locator(".patient-pain-scale")).toBeVisible();

  // Native range controls can report zero visual height in headless WebKit even
  // while they remain enabled and interactive. Verify the actual Report wiring
  // instead of depending on that browser-specific visibility calculation.
  const painScore = page.locator("#patient-pain-score");
  await expect(painScore).toHaveCount(1);
  await expect(painScore).toHaveAttribute("type", "range");
  await expect(painScore).toBeEnabled();
  await expect(painScore).toHaveValue("0");
  await painScore.evaluate((input) => {
    input.value = "4";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#patient-pain-output")).toHaveText("4 / 10");

  await expect(page.locator("#patient-report-comment")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-axion-story", /.+/);
  await expect(page.locator("body")).toHaveAttribute("data-axion-ui-screen", "patient-report");

  const reportNav = page.locator('.topbar .nav[data-ui-patient-nav="true"]');
  await expect(reportNav.locator('button[data-nav]')).toHaveCount(5);
  await expect(reportNav.locator('[data-nav="patient-report"]')).toBeVisible();
  await expect(reportNav.locator('[data-nav="patient-report"]')).toHaveClass(/active/);
});
