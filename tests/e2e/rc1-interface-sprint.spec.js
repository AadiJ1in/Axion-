import { test, expect } from "@playwright/test";

const patientLabels = ["Today", "Journey", "Progress", "Profile"];
const requestedWidths = [1440, 1280, 1024, 768, 430, 390, 360, 320];
const mobileWidths = [430, 390, 360, 320];

async function waitForPresentation(page) {
  await expect.poll(async () => page.locator(".prototype-strip").textContent()).toContain("Demo environment");
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
}

test("public site explains rehabilitation first and exposes clear demos", async ({ page }) => {
  await page.goto("/");
  await waitForPresentation(page);

  await expect(page.locator(".hero h1")).toContainText("Physical therapy shouldn’t stop");
  await expect(page.locator(".hero .hero-lede")).toContainText("prescribed rehabilitation at home");
  await expect(page.locator(".ui-demo-session-label")).toContainText("SYNTHETIC DEMO SESSION");
  await expect(page.locator(".proof-row")).toContainText("raw videos uploaded");
  await expect(page.locator(".ui-brand-statement h2")).toHaveText("Every movement tells a story.");

  const navLabels = await page.locator(".topbar .nav > button span").allTextContents();
  expect(navLabels).toEqual(["Product", "For Therapists", "For Patients", "Demo"]);
  await expect(page.locator('[data-nav="auth"]')).toContainText("Sign in");

  await page.locator('.topbar .nav button:has-text("Demo")').click();
  await expect(page.locator(".ui-demo-picker-heading")).toContainText("Choose an experience");
  await expect(page.locator('[data-demo-role="patient"]')).toContainText("Experience as Patient");
  await expect(page.locator('[data-demo-role="therapist"]')).toContainText("Experience as Therapist");
});

test("patient navigation has exactly four primary items and contextual concern action", async ({ page }) => {
  await page.goto("/?journey-playtest=1");
  await waitForPresentation(page);

  const nav = page.locator('.topbar .nav[data-ui-patient-nav="true"]');
  await expect(nav.locator('button[data-nav]')).toHaveCount(4);
  await expect(nav.locator('button[data-nav] span')).toHaveText(patientLabels);
  await expect(nav.locator('[data-nav="patient-report"]')).toHaveCount(0);
  await expect(page.locator('.ui-report-concern')).toBeVisible();
  await expect(page.locator('.ui-report-concern')).toHaveText(/Report a concern/i);
  await expect(page.locator(".journey-welcome h1")).toHaveText(/^Hi,/);
  await expect(page.locator(".journey-welcome h1")).not.toContainText("Good afternoon");

  await expect(page.locator(".journey-atlas")).toBeHidden();
  await nav.locator('[data-nav="lab"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-axion-patient-section", "journey");
  await expect(page.locator(".journey-atlas")).toBeVisible();
  await expect(page.locator("[data-clinic-today]")).toBeHidden();

  await nav.locator('[data-nav="patient"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-axion-patient-section", "today");
  await expect(page.locator(".journey-atlas")).toBeHidden();
});

test("patient Today has no horizontal overflow across the requested responsive matrix", async ({ page }) => {
  for (const width of requestedWidths) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    await page.goto("/?journey-playtest=1");
    await waitForPresentation(page);
    await expect(page.locator('.topbar .nav[data-ui-patient-nav="true"] button[data-nav]')).toHaveCount(4);
    await expect(page.locator('.clinic-today-recovery [data-clinic-start-today]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("mobile patient navigation remains four-wide with 44px targets", async ({ page }) => {
  for (const width of mobileWidths) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?journey-playtest=1");
    await waitForPresentation(page);

    const nav = page.locator('.topbar .nav[data-ui-patient-nav="true"]');
    await expect(nav.locator('button[data-nav]')).toHaveCount(4);
    const boxes = await nav.locator('button[data-nav]').evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
    }));
    expect(boxes).toHaveLength(4);
    boxes.forEach((box) => {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(width + 1);
    });
    await expectNoHorizontalOverflow(page);
  }
});

test("therapist workspace presents four primary destinations", async ({ page }) => {
  await page.goto("/");
  await waitForPresentation(page);
  await page.locator('[data-nav="auth"]').click();
  await expect(page.locator('[data-demo-role="therapist"]')).toBeVisible();
  await page.locator('[data-demo-role="therapist"]').click();
  await expect(page.locator(".pt-workspace-nav")).toBeVisible();

  const visiblePrimary = page.locator('.pt-workspace-nav nav button[data-therapist-section]:not([hidden])');
  await expect(visiblePrimary).toHaveCount(4);
  await expect(visiblePrimary).toHaveText(["Overview", "Patients", "Plans", "Exercise Library"]);
  await expect(page.locator('[data-therapist-section="alerts"]')).toBeHidden();
  await expect(page.locator('[data-therapist-section="checkins"]')).toBeHidden();
  await expect(page.locator('[data-clinic-needs-attention] .clinic-section-head h2')).toContainText(/may need review|caught up/i);
});

test("primary navigation is keyboard focusable with a visible focus treatment", async ({ page }) => {
  await page.goto("/");
  await waitForPresentation(page);
  await page.keyboard.press("Tab");
  await expect.poll(async () => page.evaluate(() => document.activeElement?.tagName)).toBe("BUTTON");
  const outline = await page.evaluate(() => {
    const active = document.activeElement;
    const style = active ? getComputedStyle(active) : null;
    return style ? { width: style.outlineWidth, style: style.outlineStyle } : null;
  });
  expect(outline).not.toBeNull();
  expect(outline.style).not.toBe("none");
});

test("patient Today remains usable at 200 percent zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?journey-playtest=1");
  await waitForPresentation(page);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(page.locator('.clinic-today-recovery [data-clinic-start-today]')).toBeVisible();
  await expect(page.locator('.ui-report-concern')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
