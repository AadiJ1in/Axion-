import { WHOLE_BODY_BILATERAL_PAIR_DEFINITIONS } from "./whole-body-bilateral-asymmetry.js";
import { descriptiveStats } from "./whole-body-distribution.js";

export const WHOLE_BODY_BILATERAL_COORDINATION_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 6) => {
  const n = finite(value); if (n === null) return null; const f = 10 ** digits; return Math.round(n * f) / f;
};

function median(values) {
  const x = values.map(finite).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!x.length) return null; const m = Math.floor(x.length/2); return x.length%2 ? x[m] : (x[m-1]+x[m])/2;
}

function medianFilter3(values) {
  return values.map((value, index) => {
    const window = values.slice(Math.max(0,index-1), Math.min(values.length,index+2));
    return median(window) ?? value;
  });
}

function pearson(x, y) {
  if (x.length !== y.length || x.length < 5) return null;
  const mx = x.reduce((a,b)=>a+b,0)/x.length; const my = y.reduce((a,b)=>a+b,0)/y.length;
  let num=0, dx2=0, dy2=0;
  for (let i=0;i<x.length;i+=1) { const dx=x[i]-mx; const dy=y[i]-my; num+=dx*dy; dx2+=dx*dx; dy2+=dy*dy; }
  const den=Math.sqrt(dx2*dy2); return den>1e-12 ? num/den : null;
}

function lagCorrelation(left, right, lag) {
  if (lag >= 0) return pearson(left.slice(0,left.length-lag || left.length), right.slice(lag));
  const k = -lag;
  return pearson(left.slice(k), right.slice(0,right.length-k || right.length));
}

function pairTrajectory(frames, definition) {
  const rows = frames.map((frame) => {
    const left=finite(frame?.features?.[definition.left]); const right=finite(frame?.features?.[definition.right]);
    const timestampMs=finite(frame?.timestampMs);
    return Number.isFinite(left)&&Number.isFinite(right) ? {left,right,timestampMs} : null;
  }).filter(Boolean);
  if (rows.length < 8) return null;
  const left = medianFilter3(rows.map((r)=>r.left));
  const right = medianFilter3(rows.map((r)=>r.right));
  const maxLag = Math.max(1, Math.min(12, Math.floor(rows.length * 0.2)));
  const candidates=[];
  for (let lag=-maxLag; lag<=maxLag; lag+=1) {
    const corr=lagCorrelation(left,right,lag);
    if (Number.isFinite(corr)) candidates.push({lag,corr});
  }
  if (!candidates.length) return null;
  candidates.sort((a,b)=>b.corr-a.corr || Math.abs(a.lag)-Math.abs(b.lag));
  const best=candidates[0];
  const zero=candidates.find((item)=>item.lag===0)?.corr ?? null;
  const dts=[];
  for (let i=1;i<rows.length;i+=1) {
    if (Number.isFinite(rows[i].timestampMs)&&Number.isFinite(rows[i-1].timestampMs)) {
      const dt=(rows[i].timestampMs-rows[i-1].timestampMs)/1000; if (dt>0) dts.push(dt);
    }
  }
  const medianDt=median(dts);
  const phaseDenominator=Math.max(1,rows.length-1);
  return {
    samples: rows.length,
    smoothing: "median_filter_3_samples",
    zeroLagCorrelation: round(zero),
    bestLagCorrelation: round(best.corr),
    bestLagFrames: best.lag,
    leftLeadPhase: round(best.lag/phaseDenominator),
    absoluteLagPhase: round(Math.abs(best.lag)/phaseDenominator),
    leftLeadSeconds: Number.isFinite(medianDt) ? round(best.lag*medianDt) : null,
    correlationGainFromLag: Number.isFinite(zero) ? round(best.corr-zero) : null,
    interpretation: best.lag>0 ? "left_trajectory_leads_right" : best.lag<0 ? "right_trajectory_leads_left" : "no_detected_frame_lag",
  };
}

export function analyzeWholeBodyBilateralCoordinationFrames(frames = []) {
  const usable=frames.filter((frame)=>frame?.features);
  const pairs={};
  for (const [name,definition] of Object.entries(WHOLE_BODY_BILATERAL_PAIR_DEFINITIONS)) {
    const block=pairTrajectory(usable,definition); if (block) pairs[name]=block;
  }
  return {
    schemaVersion: WHOLE_BODY_BILATERAL_COORDINATION_SCHEMA_VERSION,
    status: Object.keys(pairs).length ? "available" : "unavailable",
    clinicalStatus: "descriptive_unvalidated",
    frames: usable.length,
    pairCount: Object.keys(pairs).length,
    pairs,
    interpretation: "Lagged correlation compares the shape and timing of paired left/right derived pose trajectories after a three-sample median filter. Positive leftLeadPhase means the left trajectory precedes the right in frame phase. Correlation and lag are descriptive coordination measures, not strength, force, pathology, or injury-risk measures.",
  };
}

export function summarizeWholeBodyBilateralCoordination(reps = []) {
  const pairNames=Object.keys(WHOLE_BODY_BILATERAL_PAIR_DEFINITIONS);
  const pairs={};
  for (const name of pairNames) {
    const blocks=reps.map((rep)=>rep?.wholeBody?.bilateralCoordination?.pairs?.[name]).filter(Boolean);
    if (!blocks.length) continue;
    pairs[name]={
      reps: blocks.length,
      zeroLagCorrelation: descriptiveStats(blocks.map((b)=>b.zeroLagCorrelation)),
      bestLagCorrelation: descriptiveStats(blocks.map((b)=>b.bestLagCorrelation)),
      leftLeadPhase: descriptiveStats(blocks.map((b)=>b.leftLeadPhase)),
      absoluteLagPhase: descriptiveStats(blocks.map((b)=>b.absoluteLagPhase)),
      leftLeadSeconds: descriptiveStats(blocks.map((b)=>b.leftLeadSeconds)),
      correlationGainFromLag: descriptiveStats(blocks.map((b)=>b.correlationGainFromLag)),
    };
  }
  const all=Object.values(pairs);
  return {
    schemaVersion: WHOLE_BODY_BILATERAL_COORDINATION_SCHEMA_VERSION,
    status: all.length ? "available" : "unavailable",
    clinicalStatus: "descriptive_unvalidated",
    pairCount: all.length,
    pairs,
    bodywide: {
      zeroLagCorrelationMedianAcrossPairs: descriptiveStats(all.map((b)=>b.zeroLagCorrelation?.median)),
      bestLagCorrelationMedianAcrossPairs: descriptiveStats(all.map((b)=>b.bestLagCorrelation?.median)),
      absoluteLagPhaseMedianAcrossPairs: descriptiveStats(all.map((b)=>b.absoluteLagPhase?.median)),
    },
  };
}
