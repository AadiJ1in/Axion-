import {
  readMovementContextPreference,
  writeMovementContextPreference,
} from "./movement-context-store.js";

const CONTROL_ID = "axion-movement-context-control";

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function mountContextControl() {
  if (typeof document === "undefined") return;
  const actions = document.querySelector(".capture-actions");
  if (!actions || document.getElementById(CONTROL_ID)) return;

  const wrapper = document.createElement("label");
  wrapper.id = CONTROL_ID;
  wrapper.className = "movement-context-control";
  wrapper.dataset.movementContextControl = "true";

  const title = document.createElement("span");
  title.textContent = "Session setting";

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Movement session setting");
  select.append(
    option("unknown", "Not recorded"),
    option("home", "Home"),
    option("clinic", "Clinic"),
    option("other", "Other"),
  );
  select.value = readMovementContextPreference().environment;
  select.addEventListener("change", () => {
    writeMovementContextPreference(select.value);
  });

  const helper = document.createElement("small");
  helper.textContent = "Optional. Used only to compare movement across recorded settings.";

  wrapper.append(title, select, helper);
  actions.prepend(wrapper);
}

if (typeof document !== "undefined") {
  const observer = new MutationObserver(() => mountContextControl());
  const root = document.querySelector("#app") || document.body;
  if (root) observer.observe(root, { childList: true, subtree: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountContextControl, { once: true });
  } else {
    mountContextControl();
  }
}
