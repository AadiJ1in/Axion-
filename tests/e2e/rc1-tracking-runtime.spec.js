import { test, expect } from '@playwright/test';

test('bundled real pose model initializes and processes consecutive frames', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createDirectPoseRuntime } = await import('/src/pose-runtime.js');
    const runtime = createDirectPoseRuntime({ mediapipe: { delegate: 'cpu' } });
    try {
      await runtime.initialize();
      const source = document.createElement('canvas');
      source.width = 640; source.height = 480;
      source.getContext('2d').fillRect(0, 0, 640, 480);
      let frames = 0;
      for (let i = 0; i < 30; i++) {
        const prediction = runtime.infer(source, performance.now());
        if (!Array.isArray(prediction.landmarks)) throw new Error('Invalid pose result');
        frames++;
        await new Promise(requestAnimationFrame);
      }
      return { frames, delegate: runtime.getState().delegate };
    } finally {
      runtime.close();
    }
  });
  expect(result).toEqual({ frames: 30, delegate: 'CPU' });
  expect(errors).toEqual([]);
  // This verifies the real bundled WASM/model path, not accuracy on a human body.
});
