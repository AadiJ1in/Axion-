# Axion clinical validation and commercialization strategy

## Positioning

**Axion is movement-intelligence infrastructure for therapist-directed rehabilitation.**

The product goal is to turn the period between physical-therapy visits from a clinical blind spot into structured, reviewable information. Patients perform clinician-prescribed home exercises using an ordinary camera. Axion can provide session guidance, count movement, compare change against the patient’s own baseline, and surface concise longitudinal information for therapist review without requiring continuous video review or dedicated motion-capture hardware.

Axion should augment the therapist rather than replace the therapist. Clinical decision-making, prescription authority, progression, and interpretation remain with the PT/DPT.

## Current strengths

The repository contains a substantial working prototype rather than a slide-only concept. At the current code revision it includes:

- 93 catalog exercises with explicit movement-tracking profiles;
- patient-specific calibration and movement-specific thresholds;
- rep counting or measured-hold logic for every catalog exercise;
- longitudinal session comparison and therapist review workflows;
- therapist-published treatment plans and patient-specific roadmap sessions;
- local browser pose estimation and no raw-camera upload/storage in the prototype;
- patient and therapist product flows backed by protected session summaries.

The exercise count is asserted by `scripts/movement-profile-test.mjs`; update this document when the catalog changes.

## Current limitations

These boundaries should stay explicit in product, research, sales, and fundraising materials:

- camera-derived movement metrics are heuristic and not yet reference-validated;
- Axion has not demonstrated clinical efficacy;
- ordinary webcam pose estimation has intrinsic limitations, especially for small or partially occluded movements;
- a useful camera signal is not the same thing as a validated biomechanical or clinical measurement;
- enterprise healthcare deployment, security operations, regulatory analysis, EHR integration, procurement readiness, and clinical governance remain incomplete;
- no individualized injury-risk probability should be shown unless a prospectively validated model for the intended population and outcome has passed the product’s validation gates;
- no reimbursement claim should imply that use of Axion automatically satisfies coding, device, documentation, or payer requirements.

## Strategic priority: clinical collaborators before investors

The next external relationship priority should be evidence generation and workflow learning, not fundraising volume.

### 1. Clinical validation partners

Prioritize:

- outpatient physical-therapy clinics;
- university rehabilitation programs;
- orthopedic and sports rehabilitation groups;
- MSK health systems with defined home-exercise workflows.

The ideal early collaborator can provide clinician annotation, repeat assessments, reference measurements where available, and structured feedback on therapist workflow.

### 2. Distribution partners

Target outpatient PT networks and MSK health systems only after the product can show reproducible measurement behavior and low therapist review burden.

### 3. Reimbursement partners

Work with organizations that already operate Remote Therapeutic Monitoring (RTM) workflows. Axion should investigate whether its eventual product configuration can support those workflows; it should not market itself as automatically billable.

HHS describes RTM as capturing non-physiologic data related to therapeutic treatment, including musculoskeletal information, treatment adherence, and treatment response. CMS added three RTM codes to the 2026 therapy-code list: 98979, 98984, and 98985, alongside existing RTM codes. Exact coding applicability depends on the service, device, payer, documentation, plan-of-care, and other requirements.

Official references:

- HHS RTM overview: https://telehealth.hhs.gov/providers/best-practice-guides/telehealth-and-remote-patient-monitoring/billing-remote-patient
- HHS PT and remote monitoring guide: https://telehealth.hhs.gov/providers/best-practice-guides/telehealth-for-physical-therapy/physical-therapy-and-remote-patient-monitoring
- CMS 2026 therapy-services update: https://www.cms.gov/medicare/coding-billing/therapy-services

### 4. Technology partners

Explore partners in:

- camera and pose-estimation infrastructure;
- EHR integration;
- healthcare identity/security infrastructure;
- validated reference measurement systems such as optical motion capture, appropriate IMUs, and goniometry where suitable.

### 5. Funding

Prioritize non-dilutive and translational routes as the validation program becomes eligible:

- NIH/NSF translational programs;
- SBIR/STTR after entity and eligibility requirements are satisfied;
- university commercialization programs;
- digital-health accelerators;
- rehabilitation-focused investors after credible clinical evidence begins to accumulate.

## Validation roadmap

### Stage 1 — Measurement agreement

Compare Axion-derived outputs with clinician annotation and, where appropriate, a reference measurement system.

Initial targets:

- range of motion / excursion;
- repetition count;
- movement tempo;
- left/right difference.

For each metric, collect paired observations with participant, session, device, view, distance, and capture-condition metadata. Report at minimum bias, MAE, RMSE, repeatability, limits of agreement, and participant-grouped uncertainty where data allow. Do not define universal clinical acceptance thresholds after seeing the results; thresholds should be pre-specified by the study protocol and intended use.

### Stage 2 — Therapist utility

Measure whether Axion helps a therapist review care between visits without creating a new alert burden.

Outcomes:

- time to interpret an Axion session report;
- agreement on sessions needing therapist review;
- perceived usefulness;
- false-alert burden;
- changes to clinical decision-making;
- reviewer consistency where more than one clinician is available.

The goal is not simply to prove that Axion can generate more metrics. The goal is to show that the information is understandable, actionable, and efficient enough to fit real PT workflow.

### Stage 3 — Workflow and patient outcomes

Only after Stage 1 and Stage 2 are credible, compare Axion-assisted home-exercise workflow with usual home-exercise workflow on outcomes such as:

- prescribed session completion;
- home-exercise adherence;
- patient engagement;
- therapist review burden;
- appropriate functional PROMs;
- retention / continuation in care.

Do not treat these outcomes as established benefits until a study actually demonstrates them.

## Market context

Hinge Health’s 2025 SEC prospectus cites a commissioned Health Advances LLC MSK total-addressable-market report estimating approximately **$661 billion** in annual aggregate direct U.S. spending on MSK conditions in 2023. Use this only as attributed third-party market context rather than presenting it as Axion’s independent estimate.

SEC reference:

- https://www.sec.gov/Archives/edgar/data/1673743/000119312525125262/d829170d424b4.htm

Do not use an unverified 103 million patient figure in product copy unless the exact source and population definition are established.

## Competitive and execution risks

Important threats include:

- large digital-MSK platforms such as Hinge Health, Sword Health, and Kaia Health;
- crowded computer-vision and remote-rehabilitation intellectual-property landscapes;
- long healthcare procurement and security-review cycles;
- FDA or other regulatory exposure if claims expand into diagnosis, treatment recommendation, or clinically determinative measurement;
- clinical and product-liability risk;
- payer and reimbursement-policy changes;
- the difficulty of proving that camera-derived metrics are not merely technically repeatable but clinically meaningful.

## Intellectual-property landscape

The following references are useful starting points for a professional patent search. They are **not** a freedom-to-operate opinion, validity analysis, or legal conclusion.

1. **US20120296235A1 — Automated system and method for performing and monitoring physical therapy exercises**  
   https://patents.google.com/patent/US20120296235A1/en  
   Google Patents currently labels the U.S. application abandoned. It is still relevant prior art for camera/motion-capture monitoring, template comparison, real-time feedback, rep counting, and therapist transmission concepts.

2. **US20250349411A1 — Systems and methods for use of computer vision and artificial intelligence for remote physical therapy**  
   https://patents.google.com/patent/US20250349411A1/en

3. **US20250149145A1 — Physical therapy assistant as a service**  
   https://patents.google.com/patent/US20250149145A1/en

The original input listed US20120296235A1 twice; the duplicate has been removed here.

Before Axion commits to a specific claim set, commercial architecture, or financing representation, have patent counsel perform a claim-level landscape and freedom-to-operate review across relevant U.S. and international families.

## Product rule

The near-term product should optimize for **reproducible measurement + therapist usefulness + patient adherence**, not for the largest possible number of scores or clinical claims.

A strong validation result that shows a narrow metric is reproducible and useful is more valuable than an impressive-looking but unvalidated “AI movement score.”