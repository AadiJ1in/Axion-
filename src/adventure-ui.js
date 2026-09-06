export function adventureMarkup(mapping, targetReps, assignment, escapeHtml) {
 const e=escapeHtml;
 return `<section class="movement-game-card adventure-card" data-scene="${mapping.scene}">
  <div class="movement-game-heading"><div><span class="game-kicker">AXION · THE FRACTURED WORLD</span><h3>${e(mapping.title)}</h3><p>${e(mapping.action === "duck" ? "You are the player. See yourself duck through approaching light gates. Keep your prescribed squat range and pace." : mapping.instruction)}</p></div><div class="mode-switch"><button data-movement-mode="standard">Standard view</button><button class="active" data-movement-mode="game">Adventure</button></div></div>
  <div id="movement-game-stage" class="movement-game-stage active">
   <div class="game-story-bar"><div><small id="game-chapter">YOUR JOURNEY BEGINS</small><b id="game-story">Restore the world, one prescribed movement at a time.</b></div><button id="adventure-sound" type="button" aria-pressed="false">Sound off</button></div>
   <div class="adventure-viewport"><canvas id="adventure-canvas" aria-label="${e(mapping.title)} movement-controlled camera game"></canvas>
    <div id="game-feedback" class="game-feedback" role="status">Set up your camera to enter the level</div>
    <div id="game-completion" class="game-completion hidden"><div><small>PASSAGE RESTORED</small><b>Your prescribed movement is complete</b><p>${assignment.target_sets || 1} sets · ${targetReps} valid reps</p><strong id="adventure-stars"></strong><p id="adventure-reward"></p><button type="button" class="button button--primary" id="adventure-save">Save journey</button></div></div>
   </div>
   <div class="game-hud"><div><small>SET</small><b><span id="game-set">1</span> / ${assignment.target_sets||1}</b></div><div><small>REPS THIS SET</small><b><span id="game-set-reps">0</span> / ${assignment.target_repetitions||10}</b></div><div><small>REMAINING</small><b id="game-remaining">${targetReps}</b></div><div class="game-quality"><small>TRACKING</small><b id="game-quality">Waiting for camera</b></div><div><small>GAME SCORE</small><b id="game-score">0</b></div><div><small>ARTIFACT SHARDS</small><b id="game-collectibles">0</b></div><button id="game-pause" type="button">Pause</button></div>
   <div class="game-mission-progress"><span><i id="game-progress"></i></span><small id="game-status">Collisions affect game score only. Valid exercise reps always count.</small></div>
  </div></section>`;
}
