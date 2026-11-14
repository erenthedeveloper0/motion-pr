import {
  animationInterval,
  animationKey,
  canonicalEasing,
  cssEasingSamples,
  decomposeTransform,
  parseCssNumeric,
  tryParseCssEasing,
  type AnimationRecord,
  type EasingDescriptor,
  type FilmstripFrame,
  type FrameSample,
  type MotionCorrelation,
  type NumericSnapshot,
  type PropertyTrack,
  type RawAnimation,
  type RawSample,
  type RawScrollTrack,
  type RawTimeline,
  type ScrollMotionRecord,
  type TimelineRecord,
} from "@motionpr/core";

function cssEasingDescriptor(value: string, scope: EasingDescriptor["scope"]): EasingDescriptor {
  const samples = cssEasingSamples(value);
  return samples
    ? { value: canonicalEasing(value), kind: "css", scope, samples, samplesSource: "exact" }
    : { value: value.trim(), kind: "unknown", scope };
}

function easingDescriptors(raw: RawAnimation): {
  easing: EasingDescriptor;
  keyframeEasings?: string[];
  effective: EasingDescriptor;
} {
  if (raw.keyframes.length === 0) {
    // Adapter-reported (JavaScript-driven) animation: the adapter supplies easing samples.
    const kind: EasingDescriptor["kind"] =
      raw.easingKind ??
      (tryParseCssEasing(raw.timing.easing)
        ? "css"
        : raw.source === "gsap"
          ? "gsap"
          : raw.source === "animejs"
            ? "animejs"
            : "custom");
    const easing: EasingDescriptor =
      kind === "css" && !raw.easingSamples
        ? cssEasingDescriptor(raw.timing.easing, "effect")
        : {
            value: raw.timing.easing,
            kind,
            scope: "effect",
            ...(raw.easingSamples
              ? {
                  samples: raw.easingSamples,
                  samplesSource: raw.easingSamplesSource ?? "exact",
                }
              : {}),
          };
    return { easing, effective: easing };
  }

  const easing = cssEasingDescriptor(raw.timing.easing, "effect");
  // The last keyframe's easing never applies (there is no following segment).
  const segmentEasings = raw.keyframes.slice(0, -1).map((k) => canonicalEasing(k.easing));
  const keyframeEasings = raw.keyframes.map((k) => canonicalEasing(k.easing));
  const effectIsLinear = easing.value === "linear";
  const uniform = new Set(segmentEasings);
  let effective = easing;
  if (effectIsLinear && segmentEasings.length > 0) {
    if (uniform.size === 1) {
      const only = segmentEasings[0]!;
      if (only !== "linear") effective = cssEasingDescriptor(only, "segment");
    } else {
      effective = { value: "per-keyframe", kind: "per-keyframe", scope: "segment" };
    }
  }
  return { easing, keyframeEasings, effective };
}

function numericSnapshot(values: Record<string, string>): NumericSnapshot {
  const out: NumericSnapshot = {};
  const opacity = values.opacity !== undefined ? parseCssNumeric(values.opacity) : null;
  if (opacity) out.opacity = opacity.value;
  if (values.transform !== undefined) {
    const t = decomposeTransform(values.transform);
    if (t) {
      out.translateX = t.translateX;
      out.translateY = t.translateY;
      if (t.translateZ !== 0) out.translateZ = t.translateZ;
      out.scaleX = t.scaleX;
      out.scaleY = t.scaleY;
      out.rotate = t.rotate;
      if (t.skewX !== 0) out.skewX = t.skewX;
    }
  }
  return out;
}

function nearestFrame(frames: readonly FilmstripFrame[], time: number): string | null {
  if (!frames.length) return null;
  let best = frames[0]!;
  for (const f of frames) if (Math.abs(f.time - time) < Math.abs(best.time - time)) best = f;
  return best.asset;
}

function propertyTracks(raw: RawAnimation, samples: FrameSample[]): PropertyTrack[] {
  return raw.properties.map((property) => {
    const keyframes = raw.keyframes
      .filter((k) => k.values[property] !== undefined)
      .map((k) => ({
        offset: k.offset,
        value: k.values[property]!,
        ...(k.easing ? { easing: canonicalEasing(k.easing) } : {}),
      }));
    const sampled = samples
      .map((s) => s.values[property])
      .filter((v): v is string => v !== undefined);
    return {
      property,
      keyframes,
      from: keyframes[0]?.value ?? sampled[0] ?? null,
      to: keyframes[keyframes.length - 1]?.value ?? sampled[sampled.length - 1] ?? null,
    };
  });
}

/**
 * Converts raw agent output into validated-shape animation records. Assigns stable ids
 * (`element::type::name`, suffixed `#2`, `#3` for duplicates in the same checkpoint).
 */
export function normalizeAnimations(
  raws: readonly RawAnimation[],
  samples: readonly RawSample[][],
  frames: readonly FilmstripFrame[],
  sampleCount: number,
  timelineIds: ReadonlyMap<string, string> = new Map(),
): AnimationRecord[] {
  const seen = new Map<string, number>();
  return raws.map((raw, i) => {
    const base = animationKey(raw.element.key, raw.type, raw.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}#${n}`;

    const series = samples[i] ?? [];
    const frameSamples: FrameSample[] = series.map((s, index) => {
      const values: Record<string, string> = {};
      for (const p of raw.properties) if (s.values[p] !== undefined) values[p] = s.values[p]!;
      return {
        index,
        time: s.local,
        windowTime: s.t,
        progress: series.length > 1 ? Math.round((index / (series.length - 1)) * 1e4) / 1e4 : 0,
        iterationProgress: s.iterationProgress,
        values,
        numeric: numericSnapshot(s.values),
        box: s.box,
        frame: nearestFrame(frames, s.t),
      };
    });

    const reasons = [...raw.notes];
    let status: AnimationRecord["completeness"]["status"] = "complete";
    if (!raw.samplable || frameSamples.length === 0) {
      status = "metadata-only";
      if (!reasons.length) reasons.push("Animation could not be replayed for sampling.");
    } else if (frameSamples.length < sampleCount || reasons.length > 0) {
      status = "partial";
    }
    if (frameSamples.length && frameSamples.every((s) => s.box === null)) {
      status = status === "complete" ? "partial" : status;
      reasons.push("Element geometry was not measurable during sampling.");
    }

    const { easing, keyframeEasings, effective } = easingDescriptors(raw);
    return {
      id,
      type: raw.type,
      source: raw.source,
      driver: raw.driver,
      provenance: raw.provenance,
      parent: raw.parent ? (timelineIds.get(raw.parent) ?? null) : null,
      name: raw.name,
      element: raw.element,
      startTime: raw.startTime,
      timing: {
        duration: raw.timing.duration,
        delay: raw.timing.delay,
        endDelay: raw.timing.endDelay,
        iterations: raw.timing.iterations,
        iterationStart: raw.timing.iterationStart,
        direction: raw.timing.direction,
        fill: raw.timing.fill,
        playbackRate: raw.timing.playbackRate,
        easing,
        ...(keyframeEasings ? { keyframeEasings } : {}),
        effectiveEasing: effective,
        activeDuration: raw.timing.activeDuration,
        endTime: raw.timing.endTime,
      },
      properties: propertyTracks(raw, frameSamples),
      samples: frameSamples,
      completeness: { status, reasons },
      timeline: raw.timeline,
      progressTrace: raw.progressTrace ?? [],
      playState: raw.playState,
      group: raw.group,
      meta: raw.meta,
    };
  });
}

/**
 * Stable timeline ids: `<source>:<name>`, or `<source>:timeline-<n>` in start order for unnamed
 * timelines. Returns the raw-uid → id map used to link animation records to their timeline.
 */
export function timelineIds(raws: readonly RawTimeline[]): Map<string, string> {
  const ids = new Map<string, string>();
  const seen = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const raw of orderTimelines(raws)) {
    let base: string;
    if (raw.name) base = `${raw.source}:${raw.name}`;
    else {
      const n = (counters.get(raw.source) ?? 0) + 1;
      counters.set(raw.source, n);
      base = `${raw.source}:timeline-${n}`;
    }
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    ids.set(raw.uid, k === 1 ? base : `${base}#${k}`);
  }
  return ids;
}

function orderTimelines(raws: readonly RawTimeline[]): RawTimeline[] {
  return [...raws].sort(
    (a, b) =>
      (a.startTime ?? Number.POSITIVE_INFINITY) - (b.startTime ?? Number.POSITIVE_INFINITY) ||
      a.uid.localeCompare(b.uid),
  );
}

/** Builds timeline records; `children` lists the animation records linked through `parent`. */
export function normalizeTimelines(
  raws: readonly RawTimeline[],
  ids: ReadonlyMap<string, string>,
  animations: readonly AnimationRecord[],
): TimelineRecord[] {
  return orderTimelines(raws).map((raw): TimelineRecord => {
    const id = ids.get(raw.uid)!;
    return {
      id,
      source: raw.source,
      name: raw.name,
      startTime: raw.startTime,
      duration: raw.duration,
      iterations: raw.iterations,
      direction: raw.direction,
      playbackRate: raw.playbackRate,
      playState: raw.playState,
      progress: raw.progress,
      labels: raw.labels.map((l) => ({ name: l.name, time: round3(l.time) })),
      children: animations.filter((a) => a.parent === id).map((a) => a.id),
      provenance: raw.provenance,
      notes: raw.notes,
      meta: raw.meta,
    };
  });
}

/** Converts raw scroll tracks into records with stable ids and completeness. */
export function normalizeScroll(raws: readonly RawScrollTrack[]): ScrollMotionRecord[] {
  const seen = new Map<string, number>();
  return raws.map((raw) => {
    const base = `${raw.source}:${raw.wrapper ? raw.wrapper.key : "window"}:${raw.axis}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const reasons = [...raw.notes.filter((note) => /thinned|capped|missing|not /i.test(note))];
    const status: ScrollMotionRecord["completeness"]["status"] =
      raw.samples.length < 2 ? "metadata-only" : reasons.length ? "partial" : "complete";
    if (raw.samples.length < 2) reasons.push("Fewer than two scroll samples were observed.");
    return {
      id: n === 1 ? base : `${base}#${n}`,
      source: raw.source,
      sessionId: raw.sessionId,
      axis: raw.axis,
      wrapper: raw.wrapper,
      config: raw.config,
      samples: raw.samples.map((sample) => ({
        time: sample.time,
        actualScroll: round3(sample.actualScroll),
        animatedScroll: round3(sample.animatedScroll),
        targetScroll: round3(sample.targetScroll),
        progress: Math.round(sample.progress * 1e6) / 1e6,
        velocity: Math.round(sample.velocity * 1e4) / 1e4,
        direction: sample.direction,
        isScrolling: sample.isScrolling,
        isStopped: sample.isStopped,
        limit: round3(sample.limit),
      })),
      events: raw.events,
      prefersReducedMotion: raw.prefersReducedMotion,
      completeness: { status, reasons },
      meta: { ...raw.meta, ...(raw.notes.length ? { notes: raw.notes.join(" ") } : {}) },
    };
  });
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Window interval during which a scroller was moving (first to last moving sample). */
export function scrollMovement(record: ScrollMotionRecord): { start: number; end: number } | null {
  const s = record.samples;
  let start: number | null = null;
  let end: number | null = null;
  for (let i = 1; i < s.length; i++) {
    if (Math.abs(s[i]!.animatedScroll - s[i - 1]!.animatedScroll) > 0.01) {
      start ??= s[i - 1]!.time;
      end = s[i]!.time;
    }
  }
  return start === null || end === null ? null : { start, end };
}

/**
 * Animations whose active interval overlaps scroll movement. These are observations: MotionPR
 * reports `scroll-linked` only when the engine itself declares a scroll timeline.
 */
export function correlateMotion(
  animations: readonly AnimationRecord[],
  scroll: readonly ScrollMotionRecord[],
): MotionCorrelation[] {
  const out: MotionCorrelation[] = [];
  for (const track of scroll) {
    const movement = scrollMovement(track);
    if (!movement) continue;
    for (const animation of animations) {
      const scrollLinked = animation.timeline === "scroll" || animation.timeline === "view";
      const interval = animationInterval(animation);
      const overlap = interval
        ? Math.max(
            0,
            Math.min(interval.activeEnd, movement.end) -
              Math.max(interval.activeStart, movement.start),
          )
        : 0;
      if (!scrollLinked && overlap <= 0) continue;
      out.push({
        scroll: track.id,
        animation: animation.id,
        kind: scrollLinked ? "scroll-linked" : "overlap",
        overlapMs: round3(overlap),
      });
    }
  }
  return out;
}
