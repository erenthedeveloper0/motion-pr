import { useEffect, useRef, useState, type RefObject } from "react";

/** Preloads image URLs; returns how many have loaded (errors count as settled). */
export function usePreload(urls: readonly string[]): { loaded: number; total: number } {
  const [loaded, setLoaded] = useState(0);
  const key = urls.join("|");
  useEffect(() => {
    let cancelled = false;
    setLoaded(0);
    const unique = [...new Set(urls)];
    let count = 0;
    const images = unique.map((url) => {
      const img = new Image();
      img.decoding = "async";
      const done = () => {
        if (!cancelled) setLoaded(++count);
      };
      img.onload = done;
      img.onerror = done;
      img.src = url;
      return img;
    });
    return () => {
      cancelled = true;
      for (const img of images) {
        img.onload = null;
        img.onerror = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { loaded: Math.min(loaded, new Set(urls).size), total: new Set(urls).size };
}

export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) =>
        Math.abs(s.width - width) < 0.5 && Math.abs(s.height - height) < 0.5
          ? s
          : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** localStorage-backed state for per-viewer conveniences (panel sizes); never required to work. */
export function usePersistentNumber(key: string, initial: number): [number, (v: number) => void] {
  const [value, setValue] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(`motionpr:${key}`);
      const n = raw === null ? Number.NaN : Number(raw);
      return Number.isFinite(n) ? n : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: number) => {
    setValue(v);
    try {
      window.localStorage.setItem(`motionpr:${key}`, String(v));
    } catch {
      // storage unavailable (private mode, file:// restrictions): size simply is not remembered
    }
  };
  return [value, set];
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Keeps the latest value in a ref (for event handlers registered once). */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
