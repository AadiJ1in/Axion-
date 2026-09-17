import { test, expect } from "@playwright/test";

test("Journey stays finite and stable after repeated presentation syncs", async ({ page }) => {
  await page.goto("/?journey-playtest=1");
  await expect.poll(async () => page.locator(".prototype-strip").textContent()).toContain("Demo environment");

  const nav = page.locator('.topbar .nav[data-ui-patient-nav="true"]');
  await nav.getByRole("button", { name: "Journey" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-axion-patient-section", "journey");

  const root = page.locator(".patient-portal.journey-page");
  const intros = root.locator("[data-ui-journey-intro]");
  const atlases = root.locator(".journey-atlas");
  await expect(intros).toHaveCount(1);
  await expect(atlases).toHaveCount(1);
  await expect(intros.getByRole("heading", { name: "Your recovery journey" })).toBeVisible();
  await expect(atlases).toBeVisible();

  for (let index = 0; index < 8; index += 1) {
    await page.evaluate(() => window.__axionSyncPresentation?.());
    await page.waitForTimeout(35);
  }

  await expect(intros).toHaveCount(1);
  await expect(atlases).toHaveCount(1);
  const stableOrder = await page.evaluate(() => {
    const pageRoot = document.querySelector(".patient-portal.journey-page");
    const support = pageRoot?.querySelector(".roadmap-support-grid");
    const intro = pageRoot?.querySelector("[data-ui-journey-intro]");
    const atlas = pageRoot?.querySelector(".journey-atlas");
    return Boolean(support && intro && atlas && intro.nextElementSibling === atlas && atlas.nextElementSibling === support);
  });
  expect(stableOrder).toBe(true);
});
