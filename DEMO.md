# Axion 90-Second Demo Guide

This script demonstrates the product with synthetic patient data. It does not make clinical, diagnostic, regulatory, security-certification, or HIPAA-compliance claims.

## Fast setup

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173` in a current desktop browser.

The scripted demo does not require Supabase or camera permission. Camera mode requires `localhost` or HTTPS.

## The 70-second automatic pitch

1. Open **Motion Lab**.
2. Click **Demo Mode · 70 sec**.
3. Let the experience advance automatically:
   - 0–7 seconds: Maya's body/session baseline calibrates.
   - 7–47 seconds: five deterministic synthetic repetitions run with depth, tempo, symmetry delta, confidence, coaching, and Recovery Journey progress.
   - 47–52 seconds: the session completes and Axion generates a Motion Signature.
   - 52–62 seconds: the Movement Report opens with Baseline vs Today and a four-week drill-down.
   - 62–70 seconds: the therapist dashboard updates with an interpretable progression-review flag.
4. Use **Next step** if the presenter needs to move faster.
5. Use **Reset demo** to return all seeded state to its original values.

## Suggested narration

**Calibration**

> “Axion first learns the patient’s proportions and standing baseline for this session. The real product shows whether a body is detected and whether tracking quality is high.”

**Five repetitions**

> “The Movement Twin mirrors pose coordinates locally. Axion is not merely counting; it is building a rep sequence from depth, tempo, symmetry variation, and consistency.”

**Session completion**

> “No raw video is needed for the report. Axion stores a minimal movement summary and can reconstruct a skeleton replay from pose coordinates.”

**Baseline vs Today**

> “Maya began with variable movement consistency. Across four weeks, adherence increased from 60% to 92%, consistency rose from 61 to 86, and symmetry delta decreased from 10.8° to 5.9°.”

**Therapist dashboard**

> “Axion explains why Maya entered the attention queue. It suggests a progression for therapist review; it never changes the plan autonomously.”

## Real camera mode

Choose **Use camera** instead of Demo Mode. The browser will:

- load the MediaPipe pose model;
- request camera permission;
- report body detection and tracking quality;
- guide the user when the body is out of frame or confidence is low;
- reject multi-person frames;
- classify permission denial, missing/busy camera, disconnection, and other camera errors;
- offer a retry or immediate fallback to Demo Mode.

## State QA routes

- Empty therapist state: `http://localhost:4173/?state=empty`
- Friendly report error: `http://localhost:4173/?state=error`

Normal loading states appear briefly during navigation.

## Expected outputs

- five completed synthetic reps;
- best rep: #4;
- session completion: 5/5;
- high tracking quality in scripted mode;
- Baseline vs Today comparison;
- four-week Maya timeline;
- therapist dashboard update;
- explainable progression-review suggestion.

## Known limitations

- The camera thresholds and derived movement metrics are heuristic and not clinically validated.
- The Movement Twin is a 2D coordinate reconstruction, not a biomechanical or musculoskeletal model.
- Motion Signatures are descriptive product artifacts, not diagnoses or risk scores.
- Browser and device performance can affect real-time camera inference.
- Supabase is optional and requires a new project plus `supabase/schema.sql`.
- Independent legal, privacy, security, clinical, accessibility, human-factors, and regulatory review is required before any real healthcare deployment.
