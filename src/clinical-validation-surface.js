import "./clinical-validation-surface.css";

const VALIDATION_STAGES = [
  {
    kicker: "STAGE 1",
    title: "Validate the measurements",
    copy: "Compare Axion outputs with clinician annotation and reference measurement where appropriate.",
    items: ["ROM / excursion", "Rep count", "Tempo", "Left/right difference"],
  },
  {
    kicker: "STAGE 2",
    title: "Validate therapist usefulness",
    copy: "Test whether the report makes between-visit review faster and more consistent without adding alert burden.",
    items: ["Review time", "Sessions needing review", "False-alert burden", "Decision usefulness"],
  },
  {
    kicker: "STAGE 3",
    title: "Validate the workflow",
    copy: "Only after measurement and workflow validity are credible, compare Axion-assisted HEP with usual care.",
    items: ["Session completion", "HEP adherence", "Patient engagement", "Therapist review burden", "Functional PROMs"],
  },
];

function validationStageMarkup(stage) {
  return `<article class="clinical-validation-stage">
    <span>${stage.kicker}</span>
    <h3>${stage.title}</h3>
    <p>${stage.copy}</p>
    <ul>${stage.items.map((item) => `<li>${item}</li>`).join("")}</ul>
  </article>`;
}

function buildClinicalValidationSection() {
  const section = document.createElement("section");
  section.className = "clinical-validation-surface container-wide";
  section.id = "clinical-validation";
  section.dataset.uiClinicalValidation = "true";
  section.setAttribute("aria-labelledby", "clinical-validation-heading");
  section.innerHTML = `
    <div class="clinical-validation-heading">
      <div>
        <span class="section-kicker">VALIDATION FIRST</span>
        <h2 id="clinical-validation-heading">A working prototype. Claims still have to earn their evidence.</h2>
      </div>
      <p>Axion currently supports 93 tracked exercises, on-device AI pose estimation, a shared derived-biomechanics layer, patient-specific calibration, an experimental longitudinal Movement Signature for bodyweight squats, therapist workflows, and no raw-camera storage in the prototype. Its camera-derived measurements and adaptive comparisons remain experimental and are not yet clinically validated.</p>
    </div>

    <div class="clinical-validation-boundaries" aria-label="Current product boundaries">
      <div><b>What works today</b><p>Therapist-directed plans, patient sessions, on-device pose AI, derived biomechanics, quality-gated squat Movement Signatures, longitudinal comparison, adherence context, and protected session summaries.</p></div>
      <div><b>What is not established</b><p>Clinical efficacy, reference-level biomechanical accuracy, diagnostic capability, injury prediction, or universal reliability across camera conditions.</p></div>
      <div><b>Known camera limitation</b><p>Small, occluded, or low-amplitude movements may be below normal webcam pose-estimation resolution and can require clinician observation.</p></div>
    </div>

    <div class="clinical-validation-stage-grid">
      ${VALIDATION_STAGES.map(validationStageMarkup).join("")}
    </div>

    <div class="clinical-collaboration-callout">
      <div>
        <span>CLINICAL COLLABORATION</span>
        <h3>Clinical collaborators come before investor scale.</h3>
        <p>The next priority is working with PT clinics, university rehabilitation programs, and orthopedic rehabilitation groups that can help validate measurements and therapist workflow.</p>
      </div>
      <button class="button button--primary" type="button" data-ui-demo-role="therapist">Explore therapist workflow</button>
    </div>

    <details class="clinical-reimbursement-note">
      <summary>Reimbursement direction</summary>
      <p>Axion is investigating Remote Therapeutic Monitoring as a potential reimbursement-enabling workflow. That does not mean use of Axion automatically qualifies for reimbursement; coding depends on the exact service, device, documentation, payer, plan-of-care, and other requirements.</p>
    </details>
  `;
  return section;
}

export function syncClinicalValidationSurface() {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  if (document.querySelector("[data-ui-clinical-validation]")) return;

  const anchor = document.querySelector(".signature-feature")
    || document.querySelector(".story-section")
    || document.querySelector(".ui-brand-statement");
  if (!anchor) return;

  anchor.after(buildClinicalValidationSection());
}
