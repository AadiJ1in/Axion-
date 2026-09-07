const INTRO_SESSION_KEY = 'axion-guided-intro-v2';
const COURSE_KEY_PREFIX = 'axion-course-tour-v2:';

let activeGuide = null;
let courseAutoOpenScheduled = false;

const introSteps = [
  {
    kicker: 'WELCOME TO AXION',
    title: 'Your recovery is a journey you can see.',
    copy: 'Axion turns the exercises prescribed by your physical therapist into a guided recovery course. You will always know what you are working on, why it matters, what comes next, and how your movement is changing the world around you.',
    visual: 'welcome',
  },
  {
    kicker: 'YOUR RECOVERY COURSE',
    title: 'Your therapist creates the course. Axion brings it to life.',
    copy: 'Your therapist chooses your exercises, sets, repetitions or hold times, rest periods, instructions, and progression. Axion organizes that clinical plan into a roadmap of sessions. Locked sessions open only as your prescribed course progresses or your therapist changes it.',
    visual: 'course',
  },
  {
    kicker: 'THE STORY',
    title: 'Beacon of the Valley: your movement restores a forgotten world.',
    copy: 'The valley has gone dark after its roads, bridges, villages, gardens, and beacons stopped working. Each therapy session is a new mission. Your recovery restores one part of the valley at a time until the whole world comes back to life.',
    visual: 'beacon',
  },
  {
    kicker: 'A NEW MISSION EACH SESSION',
    title: 'Exercise is how you complete the story.',
    copy: 'One day you may wake an ancient beacon. Another session may rebuild a bridge, restore a mill, heal a river garden, or climb toward a mountain signal. The background changes as you make progress, so your physical recovery creates visible progress in the story too.',
    visual: 'missions',
  },
  {
    kicker: 'YOU + MOVEMENT BUDDY',
    title: 'Your body controls the game. Buddy shows the movement.',
    copy: 'Your live movement can guide a character, charge an object, reach a target, or move through the world. The You view shows what Axion detects from your movement. Movement Buddy is the reference demonstration that helps you understand the intended exercise pattern.',
    visual: 'buddy',
  },
  {
    kicker: 'WHAT COUNTS AS A REP',
    title: 'The story reacts to movement. The clinical tracker decides progress.',
    copy: 'Game points, collisions, collectibles, animations, and story events never create or remove a therapy rep. Only Axion’s movement tracker can validate repetitions, holds, sets, and prescription completion. This keeps the game fun without letting the game rewrite your clinical dose.',
    visual: 'tracker',
  },
  {
    kicker: 'PROGRESS, REPORTS & PRIVACY',
    title: 'You see progress. Your care team sees a useful summary.',
    copy: 'Axion tracks your completed sessions and movement summaries so you can follow your roadmap and your therapist can review what happened between visits. Camera landmarks are processed on-device; the product does not need to save raw exercise video to create the session summary.',
    visual: 'report',
  },
  {
    kicker: 'WHAT HAPPENS NEXT',
    title: 'Connect your therapist, receive your plan, then begin your first chapter.',
    copy: 'First you finish account setup. Then you connect to your physical therapist with a private invitation. After they approve the connection and publish your plan, your personal roadmap appears. Your first highlighted mission is where your story begins.',
    visual: 'next',
  },
];

function hashText(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

function courseContext() {
  const planTitle = document.querySelector('.journey-heading h2')?.textContent?.trim() || 'Your recovery plan';
  const patientLabel = document.querySelector('.journey-welcome .section-kicker')?.textContent?.trim() || 'patient';
  const therapist = document.querySelector('.journey-welcome > span')?.textContent?.trim() || 'your physical therapist';
  const missionTitle = document.querySelector('.beacon-current-mission h3')?.textContent?.trim() || document.querySelector('.journey-heading p b')?.textContent?.trim() || 'your current mission';
  const missionObjective = document.querySelector('.beacon-current-objective b')?.textContent?.trim() || 'Complete the movements prescribed for this session.';
  const sessionProgress = document.querySelector('.journey-count')?.textContent?.replace(/\s+/g, ' ')?.trim() || 'Your roadmap shows every session in your course.';
  const restoreProgress = document.querySelector('.beacon-world-progress')?.textContent?.replace(/\s+/g, ' ')?.trim() || 'The valley restores as your course advances.';
  return { planTitle, patientLabel, therapist, missionTitle, missionObjective, sessionProgress, restoreProgress };
}

function courseSteps(context) {
  return [
    {
      kicker: 'YOUR COURSE IS READY',
      title: context.planTitle,
      copy: `This roadmap is your actual therapist-prescribed recovery course. ${context.sessionProgress}. Axion uses the roadmap to show where you are now, what you have completed, and which sessions are still ahead.`,
      visual: 'course-live',
    },
    {
      kicker: 'YOUR CURRENT CHAPTER',
      title: context.missionTitle,
      copy: `This is the story attached to your current prescribed session. Your objective is: ${context.missionObjective} The mission gives your exercise a purpose, but it never changes the dose your therapist prescribed.`,
      visual: 'current-mission',
    },
    {
      kicker: 'HOW THE ROADMAP WORKS',
      title: 'Every node is both a therapy session and a story beat.',
      copy: 'Completed nodes show what you have already restored. The highlighted node is your current session. Upcoming nodes preview the journey ahead. As sessions are completed, the course advances and the valley becomes more restored.',
      visual: 'roadmap-live',
    },
    {
      kicker: 'INSIDE A SESSION',
      title: 'Calibrate → move → complete the mission → reflect.',
      copy: 'When you start a mission, Axion first calibrates the camera to your body. During the exercise you can see your movement, the game world, your prescribed set and rep progress, and Movement Buddy when a reference demonstration is available. After the dose is complete, the session summary is saved.',
      visual: 'session-flow',
    },
    {
      kicker: 'GAMEPLAY VS. CLINICAL TRACKING',
      title: 'You play the world, but the tracker protects the prescription.',
      copy: 'Your movement may steer a character, charge a beacon, collect a target, or change the environment continuously. Those game events are presentation only. A valid therapy rep or hold is credited only by Axion’s movement tracker.',
      visual: 'tracker',
    },
    {
      kicker: 'YOUR MOVEMENT INFORMATION',
      title: 'Progress is more than a score.',
      copy: 'Axion can show session completion, movement consistency, range-related measurements, and saved movement summaries. The Progress and Report areas help you understand trends while giving your therapist a concise view of what happened between visits.',
      visual: 'report',
    },
    {
      kicker: 'YOUR CARE TEAM & SAFETY',
      title: `Your treatment remains controlled by ${context.therapist}.`,
      copy: 'Axion does not replace your physical therapist. Your therapist controls the exercises, dose, progression, and clinical plan. If you have pain or a movement concern during a session, use the in-session safety control to pause tracking and follow your clinic’s instructions.',
      visual: 'safety',
    },
    {
      kicker: 'READY FOR THE FIRST MISSION',
      title: `Begin with “${context.missionTitle}.”`,
      copy: `${context.restoreProgress}. Start from the highlighted roadmap mission, review the objective, then open the prescribed exercise. Your physical progress is what moves the story forward.`,
      visual: 'ready',
    },
  ];
}

function visualMarkup(type) {
  const visuals = {
    welcome: `<div class="guide-valley"><div class="guide-sky"></div><i class="mountain one"></i><i class="mountain two"></i><i class="beacon"><b></b></i><span class="guide-signal"></span><small>YOUR RECOVERY REBUILDS THE WORLD</small></div>`,
    course: `<div class="guide-course"><span class="done">✓</span><i></i><span class="current">2</span><i></i><span>3</span><i></i><span>4</span><div><b>Therapist prescription</b><b>Session roadmap</b><b>Progression</b></div></div>`,
    beacon: `<div class="guide-beacon-scene"><div class="dark-village">⌂ ⌂ ⌂</div><div class="tower">◇<i></i></div><div class="light-village">⌂ ⌂</div><span>movement → energy → restoration</span></div>`,
    missions: `<div class="guide-mission-grid"><article><b>01</b><span>Wake the First Beacon</span></article><article><b>03</b><span>Cross the Stone Bridge</span></article><article><b>07</b><span>Heal the River Garden</span></article><article><b>10</b><span>Light the Whole Valley</span></article></div>`,
    buddy: `<div class="guide-buddy"><article><span class="stick human"><i></i><b></b><em></em></span><small>YOU</small></article><div>movement</div><article><span class="stick buddy"><i></i><b></b><em></em></span><small>BUDDY</small></article></div>`,
    tracker: `<div class="guide-boundary"><div><small>GAME WORLD</small><b>Movement, points, objects, animation</b></div><span>≠</span><div><small>CLINICAL TRACKER</small><b>Valid reps, holds, sets, completion</b></div></div>`,
    report: `<div class="guide-report"><div class="bars"><i style="height:42%"></i><i style="height:58%"></i><i style="height:72%"></i><i style="height:84%"></i><i style="height:91%"></i></div><div><b>Session complete</b><span>Movement summary</span><span>Progress trend</span><span>Therapist review</span></div></div>`,
    next: `<div class="guide-next"><span>1<small>Create account</small></span><i>→</i><span>2<small>Connect therapist</small></span><i>→</i><span>3<small>Receive plan</small></span><i>→</i><span>4<small>Start mission</small></span></div>`,
    'course-live': `<div class="guide-course-card"><small>YOUR PERSONAL COURSE</small><b>Therapist plan</b><span>Sessions arranged into one recovery journey</span><div><i class="done"></i><i class="current"></i><i></i><i></i><i></i></div></div>`,
    'current-mission': `<div class="guide-current-mission"><small>STORY MISSION</small><b>Objective</b><p>Your prescribed movement changes the world while the tracker validates the clinical dose.</p><span>SESSION → MOVEMENT → RESTORATION</span></div>`,
    'roadmap-live': `<div class="guide-roadmap"><span class="done">✓</span><i></i><span class="done">✓</span><i></i><span class="current">YOU</span><i></i><span>4</span><i></i><span>5</span></div>`,
    'session-flow': `<div class="guide-flow"><span><b>1</b>Calibrate</span><i>→</i><span><b>2</b>Move</span><i>→</i><span><b>3</b>Complete dose</span><i>→</i><span><b>4</b>Reflect</span></div>`,
    safety: `<div class="guide-safety"><span>!</span><div><b>Pain or movement concern?</b><p>Pause tracking, stop safely, and follow your care team’s instructions.</p></div></div>`,
    ready: `<div class="guide-ready"><div class="orb">✦</div><b>Current mission unlocked</b><span>Your movement moves the story forward.</span></div>`,
  };
  return visuals[type] || visuals.welcome;
}

function buildGuide({ kind, steps, storageKey }) {
  closeGuide(false);
  const layer = document.createElement('div');
  layer.className = 'axion-guide-layer';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-labelledby', 'axion-guide-title');
  layer.innerHTML = `
    <section class="axion-guide-card">
      <header class="axion-guide-brand"><span class="guide-brand-mark">A</span><div><b>AXION</b><small>PATIENT ORIENTATION</small></div><button type="button" data-guide-skip aria-label="Close orientation">×</button></header>
      <div class="axion-guide-progress" aria-hidden="true"><span></span></div>
      <div class="axion-guide-body">
        <div class="axion-guide-copy"><small data-guide-kicker></small><h1 id="axion-guide-title" data-guide-title></h1><p data-guide-copy></p><div class="axion-guide-explain"><span>WHY THIS MATTERS</span><p data-guide-why></p></div></div>
        <div class="axion-guide-visual" data-guide-visual></div>
      </div>
      <footer class="axion-guide-footer"><div><span data-guide-count></span><button type="button" class="guide-text-button" data-guide-skip>${kind === 'intro' ? 'Skip introduction' : 'Close tour'}</button></div><div><button type="button" class="guide-back" data-guide-back>Back</button><button type="button" class="guide-next" data-guide-next>Continue <span>→</span></button></div></footer>
    </section>`;
  document.body.appendChild(layer);
  activeGuide = { layer, kind, steps, storageKey, index: 0 };
  layer.querySelectorAll('[data-guide-skip]').forEach(button => button.addEventListener('click', () => closeGuide(true)));
  layer.querySelector('[data-guide-back]').addEventListener('click', () => { if (activeGuide.index > 0) { activeGuide.index -= 1; renderGuideStep(); } });
  layer.querySelector('[data-guide-next]').addEventListener('click', () => {
    if (activeGuide.index >= activeGuide.steps.length - 1) closeGuide(true);
    else { activeGuide.index += 1; renderGuideStep(); }
  });
  renderGuideStep();
}

function whyText(kind, index) {
  const intro = [
    'You should understand the entire product before being asked to perform a therapy session.',
    'The game never replaces the treatment plan. Your clinician remains the source of the prescription.',
    'The story gives repeated home exercise a reason to feel different from one session to the next.',
    'Visible consequences make progress feel tangible even when physical recovery is gradual.',
    'The game should respond to you continuously while still showing a clear movement reference.',
    'Separating gameplay from clinical validation prevents a game mechanic from changing your prescribed work.',
    'The goal is useful progress information without requiring your raw exercise video to become the product.',
    'After setup, the generic explanation gives way to your own therapist-authored recovery course.',
  ];
  const course = [
    'This is not a generic fitness path. The roadmap is the presentation of your assigned plan.',
    'Knowing the story objective gives each prescribed session a clear beginning and purpose.',
    'The roadmap shows both clinical progression and narrative progression in one place.',
    'A consistent session flow reduces uncertainty before you start moving.',
    'The game can be motivating only if clinical measurement remains independent from scoring.',
    'Reports help turn individual home sessions into information you and your therapist can use.',
    'Axion supports your care team; it does not make independent treatment decisions.',
    'The highlighted mission is the simplest place to begin: one session, one objective, one next step.',
  ];
  return (kind === 'intro' ? intro : course)[index] || 'Axion should always make the next step clear.';
}

function renderGuideStep() {
  if (!activeGuide) return;
  const { layer, steps, index, kind } = activeGuide;
  const step = steps[index];
  layer.querySelector('[data-guide-kicker]').textContent = step.kicker;
  layer.querySelector('[data-guide-title]').textContent = step.title;
  layer.querySelector('[data-guide-copy]').textContent = step.copy;
  layer.querySelector('[data-guide-why]').textContent = whyText(kind, index);
  layer.querySelector('[data-guide-visual]').innerHTML = visualMarkup(step.visual);
  layer.querySelector('[data-guide-count]').textContent = `${String(index + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`;
  layer.querySelector('.axion-guide-progress span').style.width = `${((index + 1) / steps.length) * 100}%`;
  const back = layer.querySelector('[data-guide-back]');
  back.disabled = index === 0;
  const next = layer.querySelector('[data-guide-next]');
  next.innerHTML = index === steps.length - 1 ? `${kind === 'intro' ? 'Continue to setup' : 'Start my mission'} <span>→</span>` : 'Continue <span>→</span>';
  requestAnimationFrame(() => next.focus({ preventScroll: true }));
}

function closeGuide(markSeen) {
  if (!activeGuide) return;
  const { kind, storageKey, layer } = activeGuide;
  if (markSeen) {
    if (kind === 'intro') sessionStorage.setItem(storageKey, 'complete');
    else localStorage.setItem(storageKey, 'complete');
  }
  layer.remove();
  activeGuide = null;
}

function startIntro() {
  buildGuide({ kind: 'intro', steps: introSteps, storageKey: INTRO_SESSION_KEY });
}

function startCourseTour({ force = false } = {}) {
  const context = courseContext();
  const key = `${COURSE_KEY_PREFIX}${hashText(`${context.patientLabel}|${context.planTitle}`)}`;
  if (!force && localStorage.getItem(key) === 'complete') return;
  buildGuide({ kind: 'course', steps: courseSteps(context), storageKey: key });
}

function ensureHelpButton() {
  const header = document.querySelector('.journey-welcome');
  if (!header || header.querySelector('[data-axion-guide-open]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'axion-guide-reopen';
  button.dataset.axionGuideOpen = 'true';
  button.innerHTML = '<span>?</span> How Axion works';
  button.addEventListener('click', () => startCourseTour({ force: true }));
  header.appendChild(button);
}

function inspectPage() {
  const onboarding = document.querySelector('.onboarding-page');
  if (onboarding && !activeGuide && sessionStorage.getItem(INTRO_SESSION_KEY) !== 'complete') {
    startIntro();
    return;
  }

  const journey = document.querySelector('.journey-page');
  if (!journey) {
    courseAutoOpenScheduled = false;
    return;
  }
  ensureHelpButton();
  if (activeGuide || courseAutoOpenScheduled) return;
  const context = courseContext();
  const key = `${COURSE_KEY_PREFIX}${hashText(`${context.patientLabel}|${context.planTitle}`)}`;
  if (localStorage.getItem(key) === 'complete') return;
  courseAutoOpenScheduled = true;
  setTimeout(() => {
    courseAutoOpenScheduled = false;
    if (document.querySelector('.journey-page') && !activeGuide) startCourseTour();
  }, 450);
}

const observer = new MutationObserver(inspectPage);
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', inspectPage, { once: true });
inspectPage();
