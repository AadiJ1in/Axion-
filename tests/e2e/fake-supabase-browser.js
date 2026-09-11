(() => {
  const ids = Object.freeze({
    therapist: "10000000-0000-4000-8000-000000000001",
    patientA: "20000000-0000-4000-8000-000000000001",
    patientB: "20000000-0000-4000-8000-000000000002",
  });
  const now = () => new Date().toISOString();
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  let serial = 1;
  const uuid = (prefix = "9") => `${prefix}${String(serial++).padStart(7, "0")}-0000-4000-8000-000000000001`;

  const db = {
    profiles: [
      { id: ids.therapist, display_name: "Dr. RC One", role: "therapist", onboarding_version: 1, onboarding_completed_at: now(), recovery_xp: 0, level: 1, streak_days: 0, avatar_key: "pulse" },
      { id: ids.patientA, display_name: "RC Patient A", role: "patient", onboarding_version: 1, onboarding_completed_at: now(), recovery_xp: 0, level: 1, streak_days: 0, avatar_key: "pulse" },
      { id: ids.patientB, display_name: "RC Patient B", role: "patient", onboarding_version: 1, onboarding_completed_at: now(), recovery_xp: 0, level: 1, streak_days: 0, avatar_key: "pulse" },
    ],
    therapist_patients: [
      { therapist_id: ids.therapist, patient_id: ids.patientA, status: "active", invitation_id: "invite-a", patient_confirmed_at: now(), therapist_verified_at: now(), created_at: now() },
    ],
    exercise_plans: [],
    exercise_assignments: [],
    roadmap_stages: [],
    roadmap_nodes: [],
    roadmap_node_assignments: [],
    roadmap_node_completions: [],
    exercise_sessions: [],
    session_capture_context: [],
    patient_safety_events: [],
    therapist_alerts: [],
    clinician_recommendations: [],
    therapist_notes: [],
    assignment_clinical_review_targets: [],
    therapist_patient_reviews: [],
    rep_metrics: [],
  };

  const authUsers = {
    "therapist@axion.test": { id: ids.therapist, email: "therapist@axion.test" },
    "patienta@axion.test": { id: ids.patientA, email: "patienta@axion.test" },
    "patientb@axion.test": { id: ids.patientB, email: "patientb@axion.test" },
  };
  let session = null;
  let aal = "aal1";
  const authListeners = new Set();
  let failNextSessionSave = false;
  let forceSchemaVersion = "202609100004";
  let poseModelFailure = false;
  const tableDelays = new Map();

  function sessionFor(user) {
    return { access_token: `e2e-${user.id}`, refresh_token: `e2e-r-${user.id}`, user: clone(user), aal };
  }
  function notify(event) { for (const cb of authListeners) queueMicrotask(() => cb(event, clone(session))); }

  const getTable = (name) => db[name] || (db[name] = []);
  const matches = (row, filters) => filters.every((filter) => {
    const value = row?.[filter.column];
    if (filter.type === "eq") return value === filter.value;
    if (filter.type === "neq") return value !== filter.value;
    if (filter.type === "in") return filter.values.includes(value);
    if (filter.type === "is") return value === filter.value;
    return true;
  });

  function applyOrder(rows, orders) {
    return [...rows].sort((a, b) => {
      for (const order of orders) {
        const av = a?.[order.column]; const bv = b?.[order.column];
        if (av === bv) continue;
        const result = av == null ? 1 : bv == null ? -1 : av < bv ? -1 : 1;
        return order.ascending === false ? -result : result;
      }
      return 0;
    });
  }

  function verifySessionInsert(payload) {
    if (!session?.user || session.user.id !== payload.patient_id) return { code: "42501", message: "AXION_SESSION_IDENTITY_UNAUTHORIZED" };
    if (!payload.assignment_id || !payload.client_session_id || !payload.exercise_key) return { code: "22023", message: "AXION_ASSIGNMENT_CONTEXT_MISSING" };
    const duplicate = db.exercise_sessions.find((row) => row.patient_id === payload.patient_id && row.client_session_id === payload.client_session_id);
    if (duplicate) return { code: "23505", message: "duplicate key value violates unique constraint" };
    const assignment = db.exercise_assignments.find((row) => row.id === payload.assignment_id);
    if (!assignment || assignment.status !== "active") return { code: "22023", message: "AXION_ASSIGNMENT_INACTIVE" };
    const plan = db.exercise_plans.find((row) => row.id === assignment.plan_id);
    if (!plan || plan.patient_id !== payload.patient_id || plan.status !== "active") return { code: "42501", message: "AXION_ASSIGNMENT_CONTEXT_MISMATCH" };
    if (payload.plan_id !== plan.id || payload.exercise_key !== assignment.exercise_key) return { code: "22023", message: "AXION_ASSIGNMENT_CONTEXT_MISMATCH" };
    const planNodes = db.roadmap_nodes.filter((node) => node.plan_id === plan.id);
    if (planNodes.length) {
      const node = planNodes.find((item) => item.id === payload.roadmap_node_id);
      const mapping = db.roadmap_node_assignments.find((item) => item.roadmap_node_id === payload.roadmap_node_id && item.assignment_id === assignment.id);
      if (!node || !mapping || db.roadmap_node_completions.some((item) => item.roadmap_node_id === node.id && item.patient_id === payload.patient_id)) return { code: "22023", message: "AXION_ROADMAP_NODE_STALE" };
      const completed = db.roadmap_node_completions.filter((item) => item.patient_id === payload.patient_id && planNodes.some((planNode) => planNode.id === item.roadmap_node_id)).length;
      if (!node.unlock_override && Number(node.session_number) > completed + 1) return { code: "22023", message: "AXION_ROADMAP_NODE_STALE" };
    }
    return null;
  }

  function maybeCompleteRoadmap(sessionRow) {
    if (!sessionRow.roadmap_node_id) return;
    const mappings = db.roadmap_node_assignments.filter((row) => row.roadmap_node_id === sessionRow.roadmap_node_id);
    const complete = mappings.every((mapping) => db.exercise_sessions.some((saved) => saved.roadmap_node_id === sessionRow.roadmap_node_id && saved.assignment_id === mapping.assignment_id));
    if (!complete || db.roadmap_node_completions.some((row) => row.roadmap_node_id === sessionRow.roadmap_node_id)) return;
    db.roadmap_node_completions.push({ id: uuid("7"), roadmap_node_id: sessionRow.roadmap_node_id, patient_id: sessionRow.patient_id, xp_awarded: 50, completed_at: now() });
    const profile = db.profiles.find((row) => row.id === sessionRow.patient_id);
    if (profile) profile.recovery_xp = Number(profile.recovery_xp || 0) + 50;
  }

  class Query {
    constructor(table) { this.table = table; this.filters = []; this.orders = []; this.max = null; this.operation = "select"; this.payload = null; }
    select() { return this; }
    eq(column, value) { this.filters.push({ type: "eq", column, value }); return this; }
    neq(column, value) { this.filters.push({ type: "neq", column, value }); return this; }
    in(column, values) { this.filters.push({ type: "in", column, values }); return this; }
    is(column, value) { this.filters.push({ type: "is", column, value }); return this; }
    order(column, options = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
    limit(value) { this.max = Number(value); return this; }
    insert(payload) { this.operation = "insert"; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
    update(payload) { this.operation = "update"; this.payload = payload; return this; }
    delete() { this.operation = "delete"; return this; }
    upsert(payload) { this.operation = "upsert"; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
    async execute() {
      const delayMs = Math.max(0, Number(tableDelays.get(this.table) || 0));
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const table = getTable(this.table);
      if (this.operation === "select") {
        let rows = table.filter((row) => matches(row, this.filters));
        rows = applyOrder(rows, this.orders);
        if (this.max != null) rows = rows.slice(0, this.max);
        return { data: clone(rows), error: null };
      }
      if (this.operation === "insert") {
        if (this.table === "exercise_sessions") {
          if (failNextSessionSave) { failNextSessionSave = false; return { data: null, error: { code: "E2E_NETWORK", message: "simulated network interruption" } }; }
          const payload = clone(this.payload[0]);
          const error = verifySessionInsert(payload); if (error) return { data: null, error };
          const assignment = db.exercise_assignments.find((row) => row.id === payload.assignment_id);
          const row = { id: uuid("6"), created_at: now(), session_context_version: 1, session_identity_context: { version: 1, patient_id: payload.patient_id, plan_id: payload.plan_id, assignment_id: payload.assignment_id, roadmap_node_id: payload.roadmap_node_id, exercise_key: payload.exercise_key, tracking_mode: assignment.tracking_mode, client_session_id: payload.client_session_id, started_at: payload.started_at }, ...payload };
          table.push(row); maybeCompleteRoadmap(row); return { data: clone([row]), error: null };
        }
        const rows = this.payload.map((input) => ({ id: input.id || uuid("5"), created_at: input.created_at || now(), ...clone(input) }));
        table.push(...rows); return { data: clone(rows), error: null };
      }
      if (this.operation === "update") {
        const changed = [];
        for (const row of table) if (matches(row, this.filters)) { Object.assign(row, clone(this.payload)); changed.push(row); }
        return { data: clone(changed), error: null };
      }
      if (this.operation === "delete") {
        const removed = table.filter((row) => matches(row, this.filters));
        db[this.table] = table.filter((row) => !matches(row, this.filters));
        return { data: clone(removed), error: null };
      }
      if (this.operation === "upsert") {
        const rows = [];
        for (const input of this.payload) { const row = { id: input.id || uuid("4"), created_at: input.created_at || now(), ...clone(input) }; table.push(row); rows.push(row); }
        return { data: clone(rows), error: null };
      }
      return { data: null, error: null };
    }
    async single() { const result = await this.execute(); if (result.error) return result; const rows = result.data || []; return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: `Expected one row, found ${rows.length}` } }; }
    async maybeSingle() { const result = await this.execute(); if (result.error) return result; const rows = result.data || []; return rows.length ? { data: rows[0], error: null } : { data: null, error: null }; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }

  function publishPlan(args) {
    if (session?.user?.id !== ids.therapist || aal !== "aal2") return { data: null, error: { code: "42501", message: "MFA required" } };
    const patientId = args.p_patient_id;
    if (!db.therapist_patients.some((row) => row.therapist_id === ids.therapist && row.patient_id === patientId && row.status === "active")) return { data: null, error: { code: "42501", message: "Patient not connected" } };
    for (const plan of db.exercise_plans) if (plan.therapist_id === ids.therapist && plan.patient_id === patientId && plan.status === "active") { plan.status = "archived"; plan.updated_at = now(); }
    const planId = uuid("3");
    const plan = { id: planId, therapist_id: ids.therapist, patient_id: patientId, title: args.p_title, program_label: args.p_program_label, phase_label: args.p_phase_label, instructions: args.p_instructions || null, status: "active", start_date: new Date().toISOString().slice(0,10), end_date: new Date(Date.now() + Number(args.p_duration_weeks || 1) * 7 * 86400000).toISOString().slice(0,10), duration_weeks: Number(args.p_duration_weeks || 1), sessions_per_week: Number(args.p_sessions_per_week || 1), game_enabled: args.p_game_enabled !== false, created_at: now(), updated_at: now() };
    db.exercise_plans.push(plan);
    const nameMap = { bodyweight_squat: "Bodyweight Squat", heel_raise: "Heel Raise", wall_sit: "Wall Sit" };
    (args.p_exercises || []).forEach((exercise, index) => db.exercise_assignments.push({
      id: uuid("2"), plan_id: planId, exercise_key: exercise.exercise_key, display_name: nameMap[exercise.exercise_key] || exercise.exercise_key,
      sequence: index + 1, tracking_mode: exercise.exercise_key === "wall_sit" ? "timed_hold" : "pose_reps", exercise_mode: exercise.exercise_mode || "standard",
      rest_seconds: Number(exercise.rest_seconds ?? 60), prescribed_side: exercise.prescribed_side || "either", target_sets: Number(exercise.sets || 1), target_repetitions: Number(exercise.repetitions || 1), duration_seconds: exercise.duration_seconds == null ? null : Number(exercise.duration_seconds), instructions: args.p_instructions || null, status: "active", created_at: now(), updated_at: now(),
    }));
    [1,2,3,4].forEach((n) => db.roadmap_stages.push({ id: uuid("1"), plan_id: planId, stage_number: n, title: ["Baseline","Control","Capacity","Return"][n-1], detail: "RC1 E2E stage", status: n === 1 ? "current" : "locked", unlock_after_sessions: [0,3,8,14][n-1] }));
    const total = Math.max(1, Number(args.p_duration_weeks || 1) * Number(args.p_sessions_per_week || 1));
    for (let n = 1; n <= total; n++) {
      const nodeId = uuid("8");
      db.roadmap_nodes.push({ id: nodeId, plan_id: planId, session_number: n, week_number: Math.ceil(n / Number(args.p_sessions_per_week || 1)), session_in_week: ((n - 1) % Number(args.p_sessions_per_week || 1)) + 1, biome: 1, title: `Session ${n}`, detail: "RC1 browser test", target_date: new Date().toISOString().slice(0,10), unlock_override: false, override_reason: null, overridden_at: null, created_at: now(), updated_at: now() });
      db.exercise_assignments.filter((assignment) => assignment.plan_id === planId).forEach((assignment) => db.roadmap_node_assignments.push({ roadmap_node_id: nodeId, assignment_id: assignment.id, sequence: assignment.sequence }));
    }
    return { data: planId, error: null };
  }

  const client = {
    auth: {
      async signInWithPassword({ email, password }) {
        const user = authUsers[String(email).toLowerCase()];
        if (!user || password !== "AxionTest!123") return { data: { session: null }, error: { code: "invalid_credentials", status: 400, message: "Invalid login" } };
        aal = "aal1"; session = sessionFor(user); notify("SIGNED_IN"); return { data: { session: clone(session), user: clone(user) }, error: null };
      },
      async getSession() { return { data: { session: clone(session) }, error: null }; },
      async getUser() { return { data: { user: clone(session?.user || null) }, error: session ? null : { code: "not_authenticated", message: "No session" } }; },
      async signOut() { session = null; aal = "aal1"; notify("SIGNED_OUT"); return { error: null }; },
      async updateUser() { return { data: { user: clone(session?.user || null) }, error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      onAuthStateChange(callback) { authListeners.add(callback); return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } }; },
      mfa: {
        async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: aal, nextLevel: session?.user?.id === ids.therapist ? "aal2" : "aal1" }, error: null }; },
        async listFactors() { return { data: session?.user?.id === ids.therapist ? { totp: [{ id: "factor-1", factor_type: "totp", status: "verified" }], all: [{ id: "factor-1", factor_type: "totp", status: "verified" }] } : { totp: [], all: [] }, error: null }; },
        async challenge() { return { data: { id: "challenge-1" }, error: null }; },
        async verify({ code }) { if (code !== "123456") return { data: null, error: { code: "invalid_mfa", message: "Invalid code" } }; aal = "aal2"; if (session) session = sessionFor(session.user); return { data: { access_token: session?.access_token }, error: null }; },
        async enroll() { return { data: { id: "factor-1", totp: { qr_code: "data:image/svg+xml;base64,PHN2Zy8+", secret: "RC1TEST" } }, error: null }; },
        async unenroll() { return { data: {}, error: null }; },
      },
    },
    from(table) { return new Query(table); },
    async rpc(name, args = {}) {
      if (name === "axion_application_schema_version") return { data: forceSchemaVersion, error: null };
      if (name === "publish_patient_plan_v6") return publishPlan(args);
      if (name === "therapist_review_queue") return { data: [], error: null };
      if (name === "approve_patient_connection") return { data: true, error: null };
      if (name === "create_care_invitation") return { data: { invite_code: "TESTINVITECODE00000000", patient_email: args.p_patient_email, expires_at: new Date(Date.now()+3600000).toISOString() }, error: null };
      if (name === "claim_care_invitation") return { data: {}, error: null };
      return { data: null, error: null };
    },
    channel() { const channel = { on() { return channel; }, subscribe() { return channel; }, unsubscribe() { return Promise.resolve(); } }; return channel; },
    async removeChannel() { return "ok"; },
  };

  window.__AXION_E2E_SUPABASE__ = client;
  window.__AXION_E2E_CONTROL__ = {
    ids,
    db,
    failNextSessionSave() { failNextSessionSave = true; },
    setTableDelay(table, milliseconds) { tableDelays.set(String(table), Math.max(0, Number(milliseconds) || 0)); },
    setSchemaVersion(value) { forceSchemaVersion = String(value); },
    expireSession() { session = null; aal = "aal1"; notify("SIGNED_OUT"); },
    refreshSession() { if (session?.user) { session = sessionFor(session.user); notify("TOKEN_REFRESHED"); } },
    setPoseModelFailure(value) { poseModelFailure = Boolean(value); },
    get poseModelFailure() { return poseModelFailure; },
    snapshot() { return clone(db); },
  };
})();
