export function adventureMarkup(mapping, targetReps, assignment, escapeHtml) {
 const e=escapeHtml;const squat=mapping.action==='duck';const story=mapping.story||{};
 const missionTitle=story.title||mapping.title;
 const missionAct=story.act||'BEACON OF THE VALLEY';
 const briefing=story.briefing||mapping.instruction;
 const goal=story.goal||mapping.instruction;
 const completion=story.completion||'Your prescribed movement is complete.';
 const gameTitle=mapping.title||story.gameTitle||'Beacon Mission';
 const movementRole=mapping.movementRole||story.movementRole||'guide the mission';
 const worldEffect=mapping.worldEffect||story.worldEffect||'restore the next part of the world';
 return `<section class="movement-game-card adventure-card" data-scene="${mapping.scene}" data-world="${e(mapping.world||'beacon')}" data-gameplay="${e(mapping.gameplay||mapping.family||'beacon')}">
  <div class="movement-game-heading"><div><span class="game-kicker">AXION · BEACON OF THE VALLEY</span><h3>${e(missionTitle)}</h3><p>${e(mapping.instruction)}</p></div><div class="mode-switch"><button data-movement-mode="standard">Standard view</button><button class="active" data-movement-mode="game">Adventure</button></div></div>
  <div class="beacon-story-briefing">
    <div><span class="beacon-story-act">${e(missionAct)}</span><h4>Session ${Number(story.sessionNumber)||1}: ${e(missionTitle)}</h4><p>${e(briefing)}</p></div>
    <div class="beacon-story-goal"><small>STORY OBJECTIVE</small><b>${e(goal)}</b></div>
  </div>
  <div class="exercise-game-identity">
    <div><small>MOVEMENT GAME</small><strong>${e(gameTitle)}</strong><span>${e(mapping.exerciseName||'Prescribed exercise')}</span></div>
    <div><small>YOUR MOVEMENT</small><b>${e(movementRole)}</b></div>
    <div><small>WORLD EFFECT</small><b>${e(worldEffect)}</b></div>
  </div>
  <div class="game-how-to" aria-label="How to play this movement game">
    <strong>HOW TO PLAY</strong>
    <span><i>1</i><b>Move slowly through your prescribed range.</b> The glowing guide follows you; do not chase it.</span>
    <span><i>2</i><b>Control the world with steady movement.</b> Small camera noise is smoothed so the game stays calm.</span>
    <span><i>3</i><b>Only a valid Axion rep advances therapy.</b> Game score and tokens are optional.</span>
    <span><i>4</i><b>Between sets, rest.</b> A countdown tells you exactly when the next set begins.</span>
  </div>
  <div id="movement-game-stage" class="movement-game-stage active">
   <div class="game-story-bar"><div><small id="game-chapter">${e(missionAct)}</small><b id="game-story">${e(story.beats?.[0]||'Restore the world, one prescribed movement at a time.')}</b></div><button id="adventure-sound" type="button" aria-pressed="false">Sound off</button></div>
   <div class="adventure-viewport"><canvas id="adventure-canvas" aria-label="${e(gameTitle)} movement-controlled story game for ${e(missionTitle)}"></canvas>
    <div class="game-mode-badge"><small>PLAYING</small><b>${e(gameTitle)}</b></div>
    <div id="game-feedback" class="game-feedback" role="status">${squat ? "Starting camera and movement calibration…" : "Move slowly when tracking says ready"}</div>
    <div id="game-completion" class="game-completion hidden"><div><small>MISSION RESTORED</small><b>${e(missionTitle)} complete</b><p>${e(completion)}</p><p>${assignment.target_sets || 1} sets · ${targetReps} valid clinical completions</p><strong id="adventure-stars"></strong><p id="adventure-reward"></p><button type="button" class="button button--primary" id="adventure-save">Save journey</button></div></div>
   </div>
   <div class="game-hud"><div><small>SET</small><b><span id="game-set">1</span> / ${assignment.target_sets||1}</b></div><div><small>REPS THIS SET</small><b><span id="game-set-reps">0</span> / ${assignment.target_repetitions||10}</b></div><div><small>REMAINING</small><b id="game-remaining">${targetReps}</b></div><div class="game-quality"><small>TRACKING</small><b id="game-quality">Waiting for camera</b></div><div><small>GAME SCORE</small><b id="game-score">0</b></div>${squat ? "" : `<div><small>RESTORATION TOKENS</small><b id="game-collectibles">0</b></div>`}<button id="game-pause" type="button">Pause</button></div>
   <div class="game-mission-progress"><span><i id="game-progress"></i></span><small id="game-status">Move steadily. Valid clinical reps advance the mission; game score never changes your therapy count.</small></div>
  </div></section>`;
}
