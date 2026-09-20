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

  // Keep the low-friction "No pain" default without sacrificing the original
  // movement-concern choices. The numeric control only appears for actual pain.
  const reportChoices = page.locator('.patient-report-types span');
  const painScale = page.locator(".patient-pain-scale");
  await expect(reportChoices.filter({ hasText: /^No pain$/ })).toBeVisible();
  await expect(reportChoices.filter({ hasText: /^Pain$/ })).toBeVisible();
  await expect(reportChoices.filter({ hasText: /^Movement felt wrong$/ })).toBeVisible();
  await expect(reportChoices.filter({ hasText: /^Felt different today$/ })).toBeVisible();
  await expect(painScale).toBeHidden();

  await reportChoices.filter({ hasText: /^Movement felt wrong$/ }).click();
  await expect(painScale).toBeHidden();
  await expect(page.locator("#patient-report-comment")).toHaveAttribute("placeholder", /felt wrong/i);

  await reportChoices.filter({ hasText: /^Pain$/ }).click();
  await expect(painScale).toBeVisible();

  const painScore = page.locator("#patient-pain-score");
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

  // The four report choices collapse to a single column on narrow phones and
  // must not create horizontal scrolling.
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(reportChoices).toHaveCount(4);
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
});
