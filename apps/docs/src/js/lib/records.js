// Builds AnimationRecords for the playground and the easing lab from a real captured record (the
// demo app's nav-panel transition, site-data.json `template`), changing only what the controls
// change. Samples are computed the way the browser applies a keyframe animation with that
// easing: value = from + (to − from) × eased(progress). A real capture reads them from computed
// styles instead; for a single translateY/opacity animation the two agree.
import { sampleEasing, tryParseCssEasing } from "./engine.js";

const clone = (o) => JSON.parse(JSON.stringify(o));

export function easingDescriptor(value) {
  const parsed = tryParseCssEasing(value);
  if (!parsed) return null;
  return {
    value: value.trim(),
    kind: "css",
    scope: "effect",
    samples: sampleEasing(parsed),
    samplesSource: "exact",
  };
}

/**
 * One record. `p`: { key, name, duration, delay, easing (CSS string), samples (count),
 * travel (px), group }.
 */
export function buildRecord(template, p) {
  const r = clone(template);
  const easing = easingDescriptor(p.easing);
  if (!easing) throw new Error(`invalid easing ${p.easing}`);
  const fn = (x) => {
    // Evaluate through the 65 samples (exactly what MotionPR compares), linearly between them.
    const pos = Math.min(1, Math.max(0, x)) * (easing.samples.length - 1);
    const i = Math.floor(pos);
    const j = Math.min(easing.samples.length - 1, i + 1);
    return easing.samples[i] + (easing.samples[j] - easing.samples[i]) * (pos - i);
  };
  r.id = `${p.key}::web-animation::${p.name}`;
  r.type = "web-animation";
  r.source = "native";
  r.driver = "waapi";
  r.name = p.name;
  r.group = p.group ?? null;
  r.element = {
    ...r.element,
    key: p.key,
    method: "motionpr-id",
    confidence: "high",
    selector: `[data-motionpr-id="${p.key.split(":")[1]}"]`,
    tag: "div",
    label: undefined,
    warnings: [],
  };
  delete r.element.label;
  r.startTime = 0;
  r.timing = {
    ...r.timing,
    duration: p.duration,
    delay: p.delay,
    endDelay: 0,
    iterations: 1,
    iterationStart: 0,
    direction: "normal",
    fill: "both",
    playbackRate: 1,
    easing,
    effectiveEasing: easing,
    activeDuration: p.duration,
    endTime: p.delay + p.duration,
  };
  delete r.timing.keyframeEasings;
  const travel = p.travel ?? 24;
  r.properties = [
    {
      property: "opacity",
      keyframes: [
        { offset: 0, value: "0" },
        { offset: 1, value: "1" },
      ],
      from: "0",
      to: "1",
    },
    {
      property: "transform",
      keyframes: [
        { offset: 0, value: `translateY(${travel}px)` },
        { offset: 1, value: "none" },
      ],
      from: `translateY(${travel}px)`,
      to: "none",
    },
  ];
  const n = p.samples ?? template.samples.length;
  r.samples = Array.from({ length: n }, (_, k) => {
    const progress = n > 1 ? k / (n - 1) : 1;
    const e = fn(progress);
    const ty = travel * (1 - e);
    return {
      index: k,
      time: p.delay + progress * p.duration,
      windowTime: p.delay + progress * p.duration,
      progress,
      iterationProgress: e,
      values: { opacity: String(e), transform: `matrix(1, 0, 0, 1, 0, ${ty})` },
      numeric: { opacity: e, translateX: 0, translateY: ty, scaleX: 1, scaleY: 1, rotate: 0 },
      box: { x: 0, y: 100 + ty, width: 120, height: 80 },
      frame: null,
    };
  });
  r.completeness = { status: "complete", reasons: [] };
  r.progressTrace = [];
  r.provenance = {
    duration: "declared",
    delay: "declared",
    easing: "declared",
    startTime: "observed",
  };
  r.meta = {};
  return r;
}
