import { test, expect } from "@playwright/test";

test("contextual patient concern opens reporting without a fifth primary tab", async ({ page }) => {
  await page.goto("/?journey-playtest=1");
  await expect.poll(async () => page.locator(".prototype-strip").textContent()).toContain("Demo environment");

  const nav = page.locator('.topbar .nav[data-ui-patient-nav="true"]');
  await expect(nav.locator('button[data-nav]')).toHaveCount(4);
  await expect(nav.locator('[data-nav="patient-report"]')).toHaveCount(0);

  const concern = page.locator('.ui-report-concern');
  await expect(concern).toBeVisible();
  await expect(concern).toHaveText(/Report a concern/i);
  await concern.click();

  await expect(page.locator(".patient-report-page")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-axion-story", /.+/);
  await expect(page.locator("body")).toHaveAttribute("data-axion-ui-screen", "patient-report");
  await expect(page.locator('.topbar .nav[data-ui-patient-nav="true"] button[data-nav]')).toHaveCount(4);
  await expect(page.locator('.topbar .nav[data-ui-patient-nav="true"] [data-nav="patient-report"]')).toHaveCount(0);
});
