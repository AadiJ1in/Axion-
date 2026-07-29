const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!magnitude) return 180;
  return (Math.acos(clamp(dot / magnitude, -1, 1)) * 180) / Math.PI;
}

function averageVisibleAngle(landmarks) {
  const sides = [
    [23, 25, 27],
    [24, 26, 28],
  ];

  const values = sides
    .filter(([hip, knee, ankle]) =>
      [hip, knee, ankle].every((index) => (landmarks[index]?.visibility ?? 0) > 0.55),
    )
    .map(([hip, knee, ankle]) =>
      angle(landmarks[hip], landmarks[knee], landmarks[ankle]),
    );

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function createSquatTracker({
  video,
  canvas,
  onUpdate,
  onError,
}) {
  let landmarker;
  const trackerApi = {};
  let stream;
  let running = false;
  let rafId = null;
  let lastVideoTime = -1;
  let stage = "up";
  let reps = 0;
  let lowFrames = 0;
  let highFrames = 0;

  async function initialize() {
    const { DrawingUtils, FilesetResolver, PoseLandmarker } = await import(
      /* @vite-ignore */
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm"
    );
    trackerApi.DrawingUtils = DrawingUtils;
    trackerApi.PoseLandmarker = PoseLandmarker;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
    );

    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
  }

  function draw(result) {
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!result.landmarks?.length) return;
    const drawing = new trackerApi.DrawingUtils(ctx);
    drawing.drawConnectors(
      result.landmarks[0],
      trackerApi.PoseLandmarker.POSE_CONNECTIONS,
      { color: "#6f8cff", lineWidth: 4 },
    );
    drawing.drawLandmarks(result.landmarks[0], {
      color: "#4cdb98",
      radius: 3,
    });
  }

  function updateState(kneeAngle) {
    if (kneeAngle === null) {
      lowFrames = 0;
      highFrames = 0;
      onUpdate({ reps, stage, angle: null, message: "Move your full body into frame." });
      return;
    }

    if (kneeAngle < 105) {
      lowFrames += 1;
      highFrames = 0;
      if (lowFrames >= 3) stage = "down";
    } else if (kneeAngle > 155) {
      highFrames += 1;
      lowFrames = 0;
      if (stage === "down" && highFrames >= 3) {
        reps += 1;
        stage = "up";
      }
    } else {
      lowFrames = 0;
      highFrames = 0;
    }

    let message = "Stand tall to begin.";
    if (stage === "down") message = "Good depth. Stand back up.";
    else if (kneeAngle < 150) message = "Lower with control.";
    else message = "Ready for the next squat.";

    onUpdate({
      reps,
      stage,
      angle: Math.round(kneeAngle),
      message,
    });
  }

  async function frame() {
    if (!running) return;

    if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
      lastVideoTime = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      draw(result);
      const landmarks = result.landmarks?.[0];
      updateState(landmarks ? averageVisibleAngle(landmarks) : null);
    }

    rafId = requestAnimationFrame(frame);
  }

  async function start() {
    try {
      if (!landmarker) await initialize();
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      running = true;
      frame();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Camera initialization failed.");
    }
  }

  function reset() {
    reps = 0;
    stage = "up";
    lowFrames = 0;
    highFrames = 0;
    onUpdate({ reps, stage, angle: null, message: "Counter reset." });
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { start, stop, reset, getReps: () => reps };
}
