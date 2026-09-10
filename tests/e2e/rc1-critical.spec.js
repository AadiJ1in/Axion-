import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeSupabase = path.join(here, "fake-supabase-browser.js");
const fakeTracker = path.join(here, "fake-movement-tracker-browser.js");

const IDS = Object.freeze({
  therapist: "10000000-0000-4000-8000-000000000001",
  patientA: "20000000-0000-4000-8000-000000000001",
  patientB: "20000000-0000-4000-8000-000000000002",
  plan: "30000000-0000-4000-8000-000000000001",
  assignmentA: "40000000-0000-4000-8000-000000000001",
  assignmentB: "40000000-0000-4000-8000-000000000002",
  node: "50000000-0000-4000-8000-000000000001",
});

async function boot(page) {
  await page.addInitScript({ path: fakeSupabase });
  await page.addInitScript({ path: fakeTracker });
  await page.goto("/");
  const signInEntry = page.locator('[data-nav="auth"]').first();
  await expect(signInEntry).toBeVisible();
  await signInEntry.click();
  await expect(page.locator("#auth-form")).toBeVisible();
}

async function seedPlan(page, { twoAssignments = false, sameTitle = false, targetReps = 1 } = {}) {
  await page.evaluate(({ ids, twoAssignments, sameTitle, targetReps }) => {
    const { db } = window.__AXION_E2E_CONTROL__;
    const now = new Date().toISOString();
    db.exercise_plans.push({
      id: ids.plan,
      therapist_id: ids.therapist,
      patient_id: ids.patientA,
      title: "RC1 exact identity plan",
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
    const first = {
      id: ids.assignmentA,
      plan_id: ids.plan,
      exercise_key: "bodyweight_squat",
      display_name: sameTitle ? "Shared display title" : "Bodyweight Squat",
      sequence: 1,
      tracking_mode: "pose_reps",
      exercise_mode: "standard",
      rest_seconds: 0,
      prescribed_side: "either",
      target_sets: 1,
      target_repetitions: targetReps,
      duration_seconds: null,
      instructions: "Controlled squat",
      status: "active",
      created_at: now,
      updated_at: now,
    };
    db.exercise_assignments.push(first);
    if (twoAssignments) {
      db.exercise_assignments.push({
        id: ids.assignmentB,
        plan_id: ids.plan,
        exercise_key: "heel_raise",
        display_name: sameTitle ? "Shared display title" : "Heel Raise",
        sequence: 2,
        tracking_mode: "pose_reps",
        exercise_mode: "standard",
        rest_seconds: 0,
        prescribed_side: "either",
        target_sets: 1,
        target_repetitions: targetReps,
        duration_seconds: null,
        instructions: "Controlled heel raise",
        status: "active",
        created_at: now,
        updated_at: now,
      });
    }
    db.roadmap_nodes.push({
      id: ids.node,
      plan_id: ids.plan,
      session_number: 1,
      week_number: 1,
      session_in_week: 1,
      biome: 1,
      title: "Session 1",
      detail: "RC1 browser verification",
      target_date: now.slice(0, 10),
      unlock_override: false,
      override_reason: null,
      overridden_at: null,
      created_at: now,
      updated_at: now,
    });
    db.roadmap_node_assignments.push({ roadmap_node_id: ids.node, assignment_id: ids.assignmentA, sequence: 1 });
    if (twoAssignments) db.roadmap_node_assignments.push({ roadmap_node_id: ids.node, assignment_id: ids.assignmentB, sequence: 2 });
  }, { ids: IDS, twoAssignments, sameTitle, targetReps });
}

async function signIn(page, email) {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("AxionTest!123");
  await page.locator("#auth-form").evaluate((form) => form.requestSubmit());
}

async function signInPatientA(page) {
  await signIn(page, "patienta@axion.test");
  await expect(page.locator(`[data-start-assignment="${IDS.assignmentA}"]`)).toBeVisible();
}

async function startAssignment(page, assignmentId = IDS.assignmentA) {
  await page.locator(`[data-start-assignment="${assignmentId}"]`).click();
  await expect(page.locator("#finish-session")).toBeVisible();
}

async function emitRep(page, overrides = {}) {
  await page.evaluate((rep) => window.__AXION_E2E_TRACKER_CONTROL__.emitRep(rep), overrides);
  await expect(page.locator("#finish-session")).toBeEnabled();
}

async function openReflection(page) {
  await page.locator("#finish-session").click();
  await expect(page.locator("[data-open-report]")).toBeVisible();
}

async function snapshot(page) {
  return page.evaluate(() => window.__AXION_E2E_CONTROL__.snapshot());
}

test("exact assignment id survives duplicate display titles and saves the performed exercise", async ({ page }) => {
  await boot(page);
  await seedPlan(page, { twoAssignments: true, sameTitle: true });
  await signInPatientA(page);
  await startAssignment(page, IDS.assignmentB);
  await emitRep(page, { jointAngle: 154, movementRangeDegrees: 26 });
  await openReflection(page);
  await page.locator("[data-open-report]").click();
  await expect.poll(async () => (await snapshot(page)).exercise_sessions.length).toBe(1);
  const saved = (await snapshot(page)).exercise_sessions[0];
  expect(saved.assignment_id).toBe(IDS.assignmentB);
  expect(saved.exercise_key).toBe("heel_raise");
  expect(saved.plan_id).toBe(IDS.plan);
  expect(saved.roadmap_node_id).toBe(IDS.node);
  expect(saved.session_identity_context.assignment_id).toBe(IDS.assignmentB);
});

test("authenticated patient cannot enter clinical Movement Lab without an exact roadmap assignment", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await page.locator('[data-nav="lab"]').first().click();
  await expect(page.getByRole("heading", { name: "Session verification required" })).toBeVisible();
  expect((await snapshot(page)).exercise_sessions).toHaveLength(0);
});

test("one completed prescribed assignment persists once, completes roadmap once, and awards XP once", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await startAssignment(page);
  await emitRep(page);
  await openReflection(page);
  await page.locator("[data-open-report]").click();
  await expect.poll(async () => (await snapshot(page)).roadmap_node_completions.length).toBe(1);
  const state = await snapshot(page);
  expect(state.exercise_sessions).toHaveLength(1);
  expect(state.roadmap_node_completions).toHaveLength(1);
  expect(state.profiles.find((profile) => profile.id === IDS.patientA).recovery_xp).toBe(50);
});

test("duplicate browser submission is idempotent and cannot double-award progress", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await startAssignment(page);
  await emitRep(page);
  await openReflection(page);
  await page.evaluate(() => {
    const button = document.querySelector("[data-open-report]");
    const event = () => new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(event());
    button.dispatchEvent(event());
  });
  await expect.poll(async () => (await snapshot(page)).exercise_sessions.length).toBe(1);
  const state = await snapshot(page);
  expect(state.exercise_sessions).toHaveLength(1);
  expect(state.roadmap_node_completions).toHaveLength(1);
  expect(state.profiles.find((profile) => profile.id === IDS.patientA).recovery_xp).toBe(50);
});

test("network interruption does not claim success and retry saves exactly once", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await startAssignment(page);
  await emitRep(page);
  await openReflection(page);
  await page.evaluate(() => window.__AXION_E2E_CONTROL__.failNextSessionSave());
  await page.locator("[data-open-report]").click();
  await expect(page.locator("[data-open-report]")).toHaveText(/Could not save/i);
  let state = await snapshot(page);
  expect(state.exercise_sessions).toHaveLength(0);
  expect(state.roadmap_node_completions).toHaveLength(0);
  await page.locator("[data-open-report]").click();
  await expect.poll(async () => (await snapshot(page)).exercise_sessions.length).toBe(1);
  state = await snapshot(page);
  expect(state.roadmap_node_completions).toHaveLength(1);
});

test("patient B cannot see or start patient A treatment data", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signIn(page, "patientb@axion.test");
  await expect(page.getByText("RC Patient B").first()).toBeVisible();
  await expect(page.locator("[data-start-assignment]")).toHaveCount(0);
  await expect(page.getByText("RC Patient A")).toHaveCount(0);
});

test("therapist MFA blocks clinical workspace until valid second factor", async ({ page }) => {
  await boot(page);
  await signIn(page, "therapist@axion.test");
  await expect(page.locator("#therapist-mfa-form")).toBeVisible();
  await page.locator("#therapist-mfa-code").fill("000000");
  await page.locator("#therapist-mfa-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#therapist-mfa-message")).toHaveText(/could not be verified/i);
  await page.locator("#therapist-mfa-code").fill("123456");
  await page.locator("#therapist-mfa-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator('[data-therapist-section="overview"]')).toBeVisible();
});

test("camera denial produces recoverable error and writes no clinical session", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await page.evaluate(() => window.__AXION_E2E_TRACKER_CONTROL__.setFailure("permission_denied"));
  await startAssignment(page);
  await expect(page.locator("#camera-recovery")).toBeVisible();
  await expect(page.locator("#camera-recovery-copy")).toHaveText(/permission was denied/i);
  expect((await snapshot(page)).exercise_sessions).toHaveLength(0);
});

test("pose-model failure preserves a recoverable UI and writes no clinical session", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await page.evaluate(() => window.__AXION_E2E_CONTROL__.setPoseModelFailure(true));
  await startAssignment(page);
  await expect(page.locator("#camera-recovery")).toBeVisible();
  await expect(page.locator("#camera-recovery-copy")).toHaveText(/movement model stopped responding/i);
  expect((await snapshot(page)).exercise_sessions).toHaveLength(0);
});

test("expired session returns to sign-in and clears clinical workspace", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await page.evaluate(() => window.__AXION_E2E_CONTROL__.expireSession());
  await expect(page.locator("#auth-form")).toBeVisible();
  await expect(page.locator("[data-start-assignment]")).toHaveCount(0);
});

test("schema mismatch fails closed before patient or therapist workspace is shown", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await page.evaluate(() => window.__AXION_E2E_CONTROL__.setSchemaVersion("202609100003"));
  await signIn(page, "patienta@axion.test");
  await expect(page.getByRole("heading", { name: "Axion update in progress" })).toBeVisible();
  await expect(page.locator("[data-start-assignment]")).toHaveCount(0);
});
