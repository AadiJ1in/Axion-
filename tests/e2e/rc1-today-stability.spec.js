import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeSupabase = path.join(here, "fake-supabase-browser.js");
const fakeTracker = path.join(here, "fake-movement-tracker-browser.js");

const IDS = Object.freeze({
  therapist: "10000000-0000-4000-8000-000000000001",
  patient: "20000000-0000-4000-8000-000000000001",
  plan: "30000000-0000-4000-8000-000000000001",
  assignment: "40000000-0000-4000-8000-000000000001",
  node: "50000000-0000-4000-8000-000000000001",
});

async function boot(page) {
  await page.addInitScript({ path: fakeSupabase });
  await page.addInitScript({ path: fakeTracker });
  await page.goto("/");
  await page.locator('[data-nav="auth"]').first().click();
  await expect(page.locator("#auth-form")).toBeVisible();
}

async function seedPlan(page) {
  await page.evaluate(({ ids }) => {
    const { db } = window.__AXION_E2E_CONTROL__;
    const now = new Date().toISOString();
    db.exercise_plans.push({
      id: ids.plan,
      therapist_id: ids.therapist,
      patient_id: ids.patient,
      title: "Stable Today plan",
      instructions: "Use controlled movement.",
      program_label: "RC1",
      phase_label: "Foundation",
      status: "active",
      start_date: now.slice(0, 10),
      end_date: now.slice(0, 10),
      duration_weeks: 1,
      sessions_per_week: 1,
      game_enabled: false,
      created_at: now,
      updated_at: now,
    });
    db.exercise_assignments.push({
      id: ids.assignment,
      plan_id: ids.plan,
      exercise_key: "bodyweight_squat",
      display_name: "Bodyweight Squat",
      sequence: 1,
      tracking_mode: "pose_reps",
      exercise_mode: "standard",
      rest_seconds: 60,
      prescribed_side: "either",
      target_sets: 3,
      target_repetitions: 10,
      duration_seconds: null,
      instructions: "Controlled squat",
      status: "active",
      created_at: now,
      updated_at: now,
    });
    db.roadmap_nodes.push({
      id: ids.node,
      plan_id: ids.plan,
      session_number: 1,
      week_number: 1,
      session_in_week: 1,
      biome: 1,
      title: "Session 1",
      detail: "Stable Today browser verification",
      target_date: now.slice(0, 10),
      unlock_override: false,
      override_reason: null,
      overridden_at: null,
      created_at: now,
      updated_at: now,
    });
    db.roadmap_node_assignments.push({
      roadmap_node_id: ids.node,
      assignment_id: ids.assignment,
      sequence: 1,
    });
  }, { ids: IDS });
}

async function signInPatient(page) {
  await page.locator("#email").fill("patienta@axion.test");
  await page.locator("#password").fill("AxionTest!123");
  await page.locator("#auth-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator(".patient-portal.journey-page")).toBeVisible();
  await expect(page.locator(".next-session-card")).toBeVisible();
  await expect(page.locator(`[data-roadmap-node="${IDS.node}"]`)).toBeVisible();
}

function delta(a, b) {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height),
  );
}

test("Today remains visually stable while async clinic enhancement completes", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatient(page);

  const root = page.locator(".patient-portal.journey-page");
  await expect(root).toHaveAttribute("data-axion-stable-section", "today");

  const card = page.locator(".next-session-card");
  const map = page.locator(".campaign-scroll");
  const before = await card.boundingBox();
  expect(before).toBeTruthy();
  expect((await map.boundingBox()).height).toBeLessThanOrEqual(160);

  await expect(root).toHaveAttribute("data-clinic-enhanced", "true");
  await page.waitForTimeout(900);

  const after = await card.boundingBox();
  expect(after).toBeTruthy();
  expect(delta(before, after)).toBeLessThanOrEqual(3);
  await expect(page.locator("[data-clinic-today]")).toBeHidden();
  await expect(page.locator("[data-clinic-phases]")).toBeHidden();
  expect((await map.boundingBox()).height).toBeLessThanOrEqual(160);
});

test("Today and Journey switch on the existing patient DOM without page rebuild", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatient(page);
  await expect(page.locator(".patient-portal.journey-page")).toHaveAttribute("data-clinic-enhanced", "true");

  const root = page.locator(".patient-portal.journey-page");
  const identity = await root.evaluate((node) => {
    node.dataset.e2eStableIdentity = "same-dom";
    return node.dataset.e2eStableIdentity;
  });
  expect(identity).toBe("same-dom");

  await page.locator('.topbar .nav [data-nav="lab"]').click();
  await expect(root).toHaveAttribute("data-axion-stable-section", "journey");
  await expect(page.locator('.topbar .nav [data-nav="lab"]')).toHaveClass(/active/);
  expect(await root.getAttribute("data-e2e-stable-identity")).toBe("same-dom");
  expect((await page.locator(".campaign-scroll").boundingBox()).height).toBeGreaterThanOrEqual(420);

  await page.locator('.topbar .nav [data-nav="patient"]').click();
  await expect(root).toHaveAttribute("data-axion-stable-section", "today");
  await expect(page.locator('.topbar .nav [data-nav="patient"]')).toHaveClass(/active/);
  expect(await root.getAttribute("data-e2e-stable-identity")).toBe("same-dom");
  expect((await page.locator(".campaign-scroll").boundingBox()).height).toBeLessThanOrEqual(160);
  await expect(page.locator(".next-session-card")).toBeVisible();
});
