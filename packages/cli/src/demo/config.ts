import type { MotionprConfig } from "@motionpr/core";

/**
 * Scenarios for the bundled demonstration app (fixtures/demo-app). The app serves the same page
 * as `/baseline/` and `/candidate/`; the candidate variant contains deliberate motion changes:
 *
 * | Scenario      | Intentional change in the candidate                                  |
 * |---------------|-----------------------------------------------------------------------|
 * | navigation    | panel duration 320ms → 560ms, easing expo-out → ease-in-out          |
 * | modal         | dialog entrance easing now overshoots                                 |
 * | work-grid     | WAAPI stagger 70ms → 120ms; decorative glow without an id changes     |
 * | faq           | answer reveal gains a 120ms delay                                     |
 * | cta-hover     | hover lift −2px → −6px with a scale-up                                |
 * | image-reveal  | clip-path reveal animation removed                                    |
 * | features      | a new "New" badge animation is added                                  |
 * | gsap-intro    | GSAP timeline ease power3.out → back.out(1.7), duration 0.6s → 0.9s   |
 * | anime-services| Anime.js stagger 60ms → 110ms                                         |
 * | anime-process | Anime.js timeline: "design" moves from -=120 to +=120; bar 700 → 900ms |
 * | lenis-journal | Lenis lerp 0.1 → 0.06; ScrollTrigger parallax starts at "top 70%"     |
 */
export const DEMO_SCENARIOS: MotionprConfig["scenarios"] = [
  {
    id: "navigation",
    name: "Navigation menu opens and closes",
    steps: [
      { type: "click", selector: "[data-testid=menu-toggle]" },
      { type: "capture", label: "open" },
      { type: "click", selector: "[data-testid=menu-close]" },
      { type: "capture", label: "closed" },
    ],
  },
  {
    id: "modal",
    name: "Booking dialog entrance and exit",
    steps: [
      { type: "click", selector: "[data-testid=modal-open]" },
      { type: "capture", label: "open" },
      { type: "click", selector: "[data-testid=modal-close]" },
      { type: "capture", label: "closed" },
    ],
  },
  {
    id: "work-grid",
    name: "Staggered work grid reveal",
    steps: [
      { type: "scrollIntoView", selector: "[data-testid=work]", block: "start" },
      { type: "waitForAnimations" },
      { type: "click", selector: "[data-testid=reveal-work]" },
      { type: "capture", label: "revealed" },
    ],
  },
  {
    id: "faq",
    name: "FAQ accordion expands",
    steps: [
      { type: "scrollIntoView", selector: "[data-testid=faq]", block: "start" },
      { type: "waitForAnimations" },
      { type: "click", selector: "[data-testid=faq-toggle-1]" },
      { type: "capture", label: "expanded" },
    ],
  },
  {
    id: "cta-hover",
    name: "Primary button hover",
    steps: [
      { type: "move", x: 4, y: 4 },
      { type: "hover", selector: "[data-testid=cta-primary]" },
      { type: "capture", label: "hovered" },
    ],
  },
  {
    id: "image-reveal",
    name: "Case study image reveal",
    steps: [
      { type: "scrollIntoView", selector: "[data-testid=case-study]", block: "start" },
      { type: "waitForAnimations" },
      { type: "click", selector: "[data-testid=reveal-image]" },
      { type: "capture", label: "revealed" },
    ],
  },
  {
    id: "features",
    name: "Features animate in on scroll",
    steps: [
      { type: "scrollIntoView", selector: "[data-testid=features]", block: "start" },
      { type: "capture", label: "in-view" },
    ],
  },
  {
    id: "gsap-intro",
    name: "GSAP hero timeline",
    steps: [
      { type: "click", selector: "[data-testid=play-intro]" },
      { type: "capture", label: "played" },
    ],
  },
  {
    id: "anime-services",
    name: "Anime.js staggered services",
    steps: [
      { type: "scrollIntoView", selector: "[data-testid=services]", block: "start" },
      { type: "waitForAnimations" },
      { type: "click", selector: "[data-testid=reveal-services]" },
      { type: "capture", label: "revealed" },
    ],
  },
  {
    id: "anime-process",
    name: "Anime.js process timeline",
    steps: [
      { type: "scrollIntoView", selector: "[data-testid=process]", block: "center" },
      { type: "waitForAnimations" },
      { type: "click", selector: "[data-testid=play-process]" },
      { type: "capture", label: "played" },
    ],
  },
  {
    id: "lenis-journal",
    name: "Lenis smooth scroll to the journal (ScrollTrigger parallax)",
    steps: [
      { type: "scrollIntoView", selector: "[data-testid=services]", block: "start" },
      { type: "waitForScrollSettled" },
      { type: "capture", label: "start", frames: false },
      { type: "scrollTo", target: "[data-testid=journal]", behavior: "smooth" },
      { type: "waitForScrollSettled" },
      { type: "capture", label: "scrolled" },
    ],
  },
];

export function demoConfig(baseURL: string): MotionprConfig {
  return {
    project: { name: "MotionPR demo · Halcyon Studio" },
    baseURL,
    browser: { viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
    capture: {
      samples: 24,
      frames: { enabled: true, fps: 24, maxFrames: 48 },
      waitForNetworkIdle: false,
    },
    adapters: [
      { name: "gsap", required: true },
      { name: "animejs", required: true },
      { name: "lenis", required: true },
    ],
    scenarios: DEMO_SCENARIOS,
  };
}
