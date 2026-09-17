import { test, expect } from '@playwright/test';

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(rgb) {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return 0;
  const [, r, g, b] = match.map(Number);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

async function waitForToday(page) {
  await page.goto('/?journey-playtest=1');
  await expect(page.locator('.patient-portal[data-ui-patient-today="true"]')).toBeVisible();
  await expect(page.locator('.clinic-today-recovery')).toBeVisible();
}

test('patient Today recovery card uses readable light high-contrast surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForToday(page);

  const colors = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      cardBackground: style('.clinic-today-recovery').backgroundColor,
      copyBackground: style('.clinic-today-copy').backgroundColor,
      title: style('.clinic-today-copy h2').color,
      exercise: style('.clinic-today-copy li b').color,
      exerciseBackground: style('.clinic-today-copy li').backgroundColor,
      detail: style('.clinic-today-copy li small').color,
      statusBackground: style('.clinic-today-status').backgroundColor,
      statusTitle: style('.clinic-today-status > b').color,
      statusMeta: style('.clinic-today-status > span').color,
      statusValue: style('.clinic-today-status dd').color,
      buttonBackground: style('.clinic-today-copy button').backgroundColor,
      buttonText: style('.clinic-today-copy button').color,
    };
  });

  expect(luminance(colors.cardBackground)).toBeGreaterThan(0.75);
  expect(luminance(colors.statusBackground)).toBeGreaterThan(0.75);
  expect(contrast(colors.title, colors.copyBackground)).toBeGreaterThanOrEqual(7);
  expect(contrast(colors.exercise, colors.exerciseBackground)).toBeGreaterThanOrEqual(7);
  expect(contrast(colors.detail, colors.exerciseBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.statusTitle, colors.statusBackground)).toBeGreaterThanOrEqual(7);
  expect(contrast(colors.statusMeta, colors.statusBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.statusValue, colors.statusBackground)).toBeGreaterThanOrEqual(7);
  expect(contrast(colors.buttonText, colors.buttonBackground)).toBeGreaterThanOrEqual(7);
});

test('patient Today contrast repair remains readable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForToday(page);

  const card = page.locator('.clinic-today-recovery');
  const status = page.locator('.clinic-today-status');
  await expect(card).toBeVisible();
  await expect(status).toBeVisible();

  const cardBox = await card.boundingBox();
  expect(cardBox.x).toBeGreaterThanOrEqual(0);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(391);
  await expect(page.locator('.clinic-today-copy button')).toBeVisible();
});
