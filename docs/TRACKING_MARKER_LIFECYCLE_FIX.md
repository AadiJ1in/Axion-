# Tracking marker lifecycle fix

Problem observed in Movement Lab: after calibration becomes ready, the clinic gate pauses the tracker while waiting for **Begin Exercise**. The existing tracker `pause()` stops the frame scheduler entirely, which also freezes the live pose overlay and Movement Buddy even though the camera stream remains granted.

Required behavior:

- camera stream may remain active;
- pose inference + overlay rendering continue while the clinical session is paused;
- clinical rep/hold measurement does not advance while paused;
- Begin Exercise resumes clinical measurement without having to recreate the camera/model loop;
- rest and explicit session pause preserve completed reps;
- model/camera failures still stop the tracker and require recovery.

This keeps visual tracking continuous without allowing paused frames to count as clinical repetitions.
