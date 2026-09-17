import { test, expect } from "@playwright/test";

test("patient demo opens the prescribed Today experience instead of onboarding", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero h1")).toContainText("Physical therapy shouldn’t stop");
  await page.locator('[data-ui-demo-role="patient"]').first().click();
  await expect(page.locator(".patient-portal.journey-page")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-axion-patient-section", "today");
  await expect(page.locator("[data-clinic-today]")).toBeVisible();
  await expect(page.locator(".onboarding-card")).toHaveCount(0);
  await expect(page.locator('.topbar .nav[data-ui-patient-nav="true"] button[data-nav]')).toHaveCount(4);
});

test("therapist demo opens the review workspace", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-ui-demo-role="therapist"]').first().click();
  await expect(page.locator(".therapist-page")).toBeVisible();
  await expect(page.locator(".pt-workspace-nav")).toBeVisible();
  await expect(page.locator('.pt-workspace-nav nav button[data-therapist-section]:not([hidden])')).toHaveCount(4);
});
