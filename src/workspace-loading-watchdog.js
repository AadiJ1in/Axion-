const PRIVATE_WORKSPACE_LABEL = "LOADING YOUR PRIVATE WORKSPACE";
const WATCHDOG_MS = 10000;
let watchdogTimer = null;

function clearWatchdog() {
  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = null;
}

function loadingPrivateWorkspace() {
  const label = document.querySelector(".loading-page .section-kicker");
  return Boolean(label && label.textContent.trim().toUpperCase() === PRIVATE_WORKSPACE_LABEL);
}

function showRecovery() {
  if (!loadingPrivateWorkspace()) return;
  const page = document.querySelector(".loading-page");
  if (!page || page.querySelector("[data-workspace-load-recovery]")) return;
  const panel = document.createElement("section");
  panel.dataset.workspaceLoadRecovery = "true";
  panel.className = "workspace-load-recovery";
  panel.innerHTML = `
    <h2>This is taking longer than expected.</h2>
    <p>Your account is signed in, but Axion has not finished loading the private workspace. No other patient data is shown while this request is incomplete.</p>
    <button type="button" data-workspace-retry>Retry workspace</button>
  `;
  page.appendChild(panel);
  panel.querySelector("[data-workspace-retry]")?.addEventListener("click", () => window.location.reload());
}

function armWatchdog() {
  clearWatchdog();
  if (!loadingPrivateWorkspace()) return;
  watchdogTimer = setTimeout(showRecovery, WATCHDOG_MS);
}

const observer = new MutationObserver(armWatchdog);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("pagehide", clearWatchdog);
armWatchdog();
