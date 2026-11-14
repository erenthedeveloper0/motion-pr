import { useEffect, useId, useRef } from "react";
import gsap from "gsap";

/** Brand mark geometry (see brand/source/motionpr-logo.mjs): XOR of a circle and its moved copy. */
const MARK_OFFSET = 0.625;
const K = Math.SQRT1_2;

function markPath(size: number, offset: number): string {
  const r = size / (2 + MARK_OFFSET * K);
  const d = Math.max(offset, 1e-4) * r;
  const c = size / 2;
  const h = Math.sqrt(r * r - (d / 2) ** 2);
  const a = [c - h * K, c - h * K];
  const b = [c + h * K, c + h * K];
  const f = (n: number) => n.toFixed(3);
  const arc = (to: number[], large: number, sweep: number) =>
    `A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(to[0]!)} ${f(to[1]!)}`;
  const start = `M${f(a[0]!)} ${f(a[1]!)}`;
  return `${start}${arc(b, 1, 0)}${arc(a, 0, 1)}Z${start}${arc(b, 1, 1)}${arc(a, 0, 0)}Z`;
}

/** The MotionPR mark. With `animate`, the crescents separate out of nothing (the brand intro). */
export function Mark({
  size = 18,
  animate = false,
  className,
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const pathRef = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (!animate || !pathRef.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const state = { offset: 0.02 };
    const tween = gsap.to(state, {
      offset: MARK_OFFSET,
      duration: 1.6,
      delay: 0.35,
      ease: "expo.out",
      onUpdate: () => pathRef.current?.setAttribute("d", markPath(size, state.offset)),
    });
    pathRef.current.setAttribute("d", markPath(size, state.offset));
    return () => {
      tween.kill();
    };
  }, [animate, size]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`mpr-${id}`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={size}
          x2={size}
          y2="0"
        >
          <stop offset="0" stopColor="#839CF6" />
          <stop offset="0.38" stopColor="#7E4AE6" />
          <stop offset="0.72" stopColor="#E5A9C7" />
          <stop offset="1" stopColor="#ECA67A" />
        </linearGradient>
      </defs>
      <path ref={pathRef} fill={`url(#mpr-${id})`} d={markPath(size, MARK_OFFSET)} />
    </svg>
  );
}
