const PRIVATE_WORKSPACE_LABEL = "LOADING YOUR PRIVATE WORKSPACE";
const WATCHDOG_MS = 10000;
let watchdogTimer = null;
let armedForLoadingState = false;

function clearWatchdog() {
  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = null;
  armedForLoadingState = false;
}

function loadingPrivateWorkspace() {
  const label = document.querySelector(".loading-page .section-kicker");
  return Boolean(label && label.textContent.trim().toUpperCase() === PRIVATE_WORKSPACE_LABEL);
}

function showRecovery() {
  watchdogTimer = null;
  if (!loadingPrivateWorkspace()) {
    armedForLoadingState = false;
    return;
  }
  const page = document.querySelector(".loading-page");
  if (!page || page.querySelector("[data-workspace-load-recovery]")) return;
  const panel = document.createElement("section");
  panel.dataset.workspaceLoadRecovery = "true";
  panel.className = "workspace-load-recovery";
  panel.innerHTML = `
    <h2>This is taking longer than expected.</h2>
    <p>Your account is signed in, but the private recovery workspace did not finish opening. No other patient data is displayed while Axion is waiting.</p>
    <div class="workspace-load-recovery__actions">
      <button type="button" data-workspace-retry>Retry workspace</button>
      <button type="button" data-workspace-signout>Sign out</button>
    </div>
  `;
  page.appendChild(panel);
  panel.querySelector("[data-workspace-retry]")?.addEventListener("click", () => window.location.reload());
  panel.querySelector("[data-workspace-signout]")?.addEventListener("click", () => {
    window.location.assign("/");
  });
}

function syncWatchdog() {
  if (!loadingPrivateWorkspace()) {
    if (armedForLoadingState || watchdogTimer) clearWatchdog();
    return;
  }
  if (armedForLoadingState) return;
  armedForLoadingState = true;
  watchdogTimer = setTimeout(showRecovery, WATCHDOG_MS);
}

const observer = new MutationObserver(syncWatchdog);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("pagehide", clearWatchdog);
syncWatchdog();
