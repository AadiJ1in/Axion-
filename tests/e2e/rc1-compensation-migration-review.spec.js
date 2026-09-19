import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeSupabase = path.join(here, "fake-supabase-browser.js");
const fakeTracker = path.join(here, "fake-movement-tracker-browser.js");

const IDS = Object.freeze({
  therapist: "10000000-0000-4000-8000-000000000001",
  patient: "20000000-0000-4000-8000-000000000001",
});

async function boot(page) {
  await page.addInitScript({ path: fakeSupabase });
  await page.addInitScript({ path: fakeTracker });
  await page.goto("/");
  await page.locator('[data-nav="auth"]').first().click();
  await expect(page.locator("#auth-form")).toBeVisible();
}

async function seedLongitudinalSessions(page) {
  await page.evaluate(({ ids }) => {
    const { db } = window.__AXION_E2E_CONTROL__;
    const start = Date.parse("2026-09-01T12:00:00Z");
    const day = 86400000;
    const knee = [15, 14, 16, 8, 7, 6, 15];
    const trunk = [4, 5, 4.5, 10, 11, 12, 4.5];

    const feature = (mean) => ({
      reps: 8,
      mean,
      min: mean - 0.5,
      max: mean + 0.5,
      first: mean,
      last: mean,
      change_first_to_last: 0,
      slope_per_rep: 0,
    });

    for (let index = 0; index < 7; index += 1) {
      const completed = new Date(start + index * 2 * day).toISOString();
      db.exercise_sessions.push({
        id: `60000000-0000-4000-8000-00000000000${index + 1}`,
        patient_id: ids.patient,
        assignment_id: "40000000-0000-4000-8000-000000000001",
        exercise_key: "bodyweight_squat",
        repetitions: 8,
        duration_seconds: 40,
        started_at: completed,
        completed_at: completed,
        created_at: completed,
        session_identity_context: {
          version: 1,
          patient_id: ids.patient,
          therapist_id: ids.therapist,
          exercise_key: "bodyweight_squat",
          prescribed_side: "either",
        },
        movement_summary: {
          biomechanics_v1: {
            schemaVersion: 1,
            source: "mediapipe_pose_derived_features",
            clinicalStatus: "descriptive_unvalidated",
            repsWithBiomechanics: 8,
            averageCoverage: 0.91,
            averageVisibility: 0.93,
            features: {
              knee_flexion_asymmetry_deg: feature(knee[index]),
              hip_flexion_asymmetry_deg: feature(6),
              ankle_angle_asymmetry_deg: feature(5),
              pelvis_line_tilt_deg: feature(3),
              trunk_image_tilt_deg: feature(trunk[index]),
              trunk_3d_tilt_deg: feature(trunk[index]),
              left_knee_path_offset_pct: feature(7),
              right_knee_path_offset_pct: feature(7),
              pelvis_depth_asymmetry_pct: feature(5),
            },
          },
        },
      });
    }
  }, { ids: IDS });
}

async function signInTherapist(page) {
  await page.locator("#email").fill("therapist@axion.test");
  await page.locator("#password").fill("AxionTest!123");
  await page.locator("#auth-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#therapist-mfa-form")).toBeVisible();
  await page.locator("#therapist-mfa-code").fill("123456");
  await page.locator("#therapist-mfa-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator('[data-therapist-section="overview"]')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__axionCompensationMigrationReview))).toBe(true);
}

async function openSyntheticSessionReviewShell(page, sessionId) {
  await page.evaluate((id) => {
    document.querySelectorAll(".clinic-modal-layer").forEach((node) => node.remove());

    const modalLayer = document.createElement("div");
    modalLayer.className = "clinic-modal-layer";
    const modal = document.createElement("section");
    modal.className = "clinic-session-modal";
    modal.setAttribute("role", "dialog");
    const header = document.createElement("header");
    const heading = document.createElement("h2");
    heading.textContent = "Stored session review";
    header.appendChild(heading);
    const context = document.createElement("section");
    context.dataset.persistedSessionContext = "true";
    context.textContent = "Persisted session context";
    modal.append(header, context);
    modalLayer.appendChild(modal);
    document.body.appendChild(modalLayer);

    const row = document.createElement("button");
    row.type = "button";
    row.className = "checkin-row";
    row.dataset.clinicSessionId = id;
    row.textContent = "Open stored session";
    // The production compensation listener runs in document capture phase.
    // Stop bubbling here so the existing clinic-readiness row handler does not
    // replace this minimal test modal after the feature has captured the id.
    row.addEventListener("click", (event) => event.stopPropagation());
    document.body.appendChild(row);
  }, sessionId);

  await page.locator(`.checkin-row[data-clinic-session-id="${sessionId}"]`).click();
}

test("clinician Compensation Migration review uses only same-exercise history available at the selected session", async ({ page }) => {
  await boot(page);
  await seedLongitudinalSessions(page);
  await signInTherapist(page);

  const selectedSessionId = "60000000-0000-4000-8000-000000000006";
  await openSyntheticSessionReviewShell(page, selectedSessionId);

  const panel = page.locator("[data-compensation-migration-review]");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Possible movement redistribution pattern" })).toBeVisible();
  await expect(panel).toContainText("Same-exercise sessions");
  await expect(panel).toContainText("6");
  await expect(panel).toContainText("10.0 d");
  await expect(panel).toContainText("91%");
  await expect(panel).toContainText(/Knee flexion asymmetry decreased while 3D trunk tilt increased/i);
  await expect(panel).toContainText(/does not diagnose injury/i);
  await expect(panel).toContainText(/predict injury risk/i);
  await expect(panel).not.toContainText(/injury probability/i);

  const futureId = await page.evaluate(() => window.__AXION_E2E_CONTROL__.db.exercise_sessions.at(-1)?.id);
  expect(futureId).toBe("60000000-0000-4000-8000-000000000007");
  await expect(panel).not.toContainText("7 same-exercise");
});
