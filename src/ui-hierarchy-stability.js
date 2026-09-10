import "./ui-hierarchy-stability.css";

export function stabilizeUiHierarchy() {
  const page = document.querySelector(".patient-portal.journey-page");
  if (!page) return;

  const support = page.querySelector(".roadmap-support-grid[data-ui-moved='true']");
  if (support && support.dataset.uiPlacementStable !== "true") {
    support.dataset.uiPlacementStable = "true";
    support.classList.add("ui-week-support");
    support.classList.remove("roadmap-support-grid");
  }

  const atlas = page.querySelector(".journey-atlas");
  const intros = [...page.querySelectorAll("[data-ui-journey-intro]")];
  if (atlas && intros.length) {
    const keep = intros.at(-1);
    intros.slice(0, -1).forEach((node) => node.remove());
    if (keep.nextElementSibling !== atlas) atlas.before(keep);
  }
}

stabilizeUiHierarchy();

window.__axionUiHierarchyStability = Object.freeze({ observerFree: true, oneTimePlacement: true });
