export function syncTherapistReviewCopy() {
  const heading = document.querySelector('[data-clinic-needs-attention] .clinic-section-head h2');
  if (!heading) return;
  if (/which patients need review today\?/i.test(heading.textContent || '')) {
    heading.textContent = 'Patients who may need review today';
  }
}
