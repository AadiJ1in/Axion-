import fs from "node:fs";
import { extractBiomechanicsFrame } from "../src/biomechanics.js";

const fixturePath = process.argv[2];
if (!fixturePath) throw new Error("fixture path required");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function skeleton(overrides = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  Object.entries(overrides).forEach(([index, point]) => { points[Number(index)] = point; });
  return points;
}

const output = fixture.cases.map((item, index) => {
  const landmarks = skeleton(item.overrides);
  return {
    name: item.name,
    frame: extractBiomechanicsFrame({
      imageLandmarks: landmarks,
      worldLandmarks: landmarks,
      timestampMs: 100 + index,
    }),
  };
});
process.stdout.write(JSON.stringify(output));
