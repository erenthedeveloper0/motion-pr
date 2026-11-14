// Halcyon demo behaviour. Every motion difference between the variants is driven by
// `candidate` below or by [data-variant="candidate"] rules in styles.css. Engines: CSS
// transitions/animations, WAAPI, GSAP (+ ScrollTrigger), Anime.js and Lenis.
(function () {
  const candidate = document.documentElement.dataset.variant === "candidate";
  const root = document.documentElement;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // GSAP + MotionPR adapter. register() is a no-op unless MotionPR is capturing this page.
  const { motionprGsap } = window.MotionprGsap;
  motionprGsap.register(window.gsap);
  const gsap = window.gsap;

  // Navigation (CSS transitions with staggered transition-delay).
  const toggle = $("[data-testid=menu-toggle]");
  const setNav = (open) => {
    root.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setNav(true));
  $("[data-testid=menu-close]").addEventListener("click", () => setNav(false));
  $("[data-testid=nav-scrim]").addEventListener("click", () => setNav(false));

  // Modal (CSS keyframe animations for entrance and exit).
  $("[data-testid=modal-open]").addEventListener("click", () => {
    root.classList.remove("modal-closing");
    root.classList.add("modal-open");
  });
  $("[data-testid=modal-close]").addEventListener("click", () => {
    root.classList.add("modal-closing");
    $(".dialog").addEventListener(
      "animationend",
      () => root.classList.remove("modal-open", "modal-closing"),
      { once: true },
    );
  });

  // Work grid (Web Animations API, JS stagger). The glow has no data-motionpr-id on purpose:
  // MotionPR can only match it by DOM position, so its change is reported as uncertain.
  $("[data-testid=reveal-work]").addEventListener("click", () => {
    $$(".work-card").forEach((card, i) => {
      card.animate(
        [
          { opacity: 0, transform: "translateY(28px) scale(0.98)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: 520,
          delay: i * (candidate ? 120 : 70),
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          fill: "both",
          id: "work-reveal",
        },
      );
    });
    $(".work-glow").animate(
      [
        { opacity: 0, transform: "scale(0.8)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: candidate ? 900 : 700, easing: "ease-out", fill: "both" },
    );
  });

  // Case study image reveal (CSS animation, removed in the candidate).
  $("[data-testid=reveal-image]").addEventListener("click", () =>
    $(".case-image").classList.add("revealed"),
  );

  // Features: scroll-triggered transitions via IntersectionObserver.
  const features = $("[data-testid=features]");
  new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) features.classList.add("in-view");
    },
    { threshold: 0.35 },
  ).observe(features);

  // FAQ accordion (grid-template-rows transition).
  $$(".faq-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const open = !item.classList.contains("open");
      item.classList.toggle("open", open);
      button.setAttribute("aria-expanded", String(open));
    });
  });

  // Lenis smooth scrolling driven by GSAP's ticker, with ScrollTrigger kept in sync (the
  // integration Lenis documents). The candidate scrolls with a slower lerp.
  gsap.registerPlugin(window.ScrollTrigger);
  const lenis = new window.Lenis({ autoRaf: false, lerp: candidate ? 0.06 : 0.1 });
  lenis.on("scroll", window.ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  window.MotionprLenis.motionprLenis.attach(lenis, { name: "page" });

  // Journal parallax: a scrubbed ScrollTrigger. The candidate starts it later in the scroll.
  gsap.to(".journal-image", {
    yPercent: -12,
    ease: "none",
    scrollTrigger: {
      trigger: ".journal",
      start: candidate ? "top 70%" : "top bottom",
      end: "bottom top",
      scrub: true,
    },
  });

  // Anime.js: staggered service cards and a sequenced process timeline.
  const { animate, createTimeline, stagger, eases } = window.anime;
  const motion = window.MotionprAnime.createAnimeInstrumentation({ eases });
  const anime = motion.wrapAnimate(animate);
  const timeline = motion.wrapTimeline(createTimeline);
  $("[data-testid=reveal-services]").addEventListener("click", () => {
    anime(".service", {
      opacity: [0, 1],
      translateY: [24, 0],
      duration: 600,
      delay: stagger(candidate ? 110 : 60),
      ease: "out(3)",
    });
  });
  $("[data-testid=play-process]").addEventListener("click", () => {
    const tl = timeline({ defaults: { duration: 360, ease: "outQuad" } });
    tl.label("discover")
      .add("[data-motionpr-id=process-discover]", { opacity: [0.25, 1] })
      .label("design")
      .add(
        "[data-motionpr-id=process-design]",
        { opacity: [0.25, 1] },
        candidate ? "+=120" : "-=120",
      )
      .label("ship")
      .add("[data-motionpr-id=process-ship]", { opacity: [0.25, 1] }, "-=120")
      .add(
        "[data-motionpr-id=process-bar]",
        { scaleX: [0, 1], duration: candidate ? 900 : 700, ease: "inOutQuad" },
        "discover",
      );
    motion.track(tl, "process");
  });

  // GSAP hero timeline.
  $("[data-testid=play-intro]").addEventListener("click", () => {
    const tl = gsap.timeline({
      defaults: {
        ease: candidate ? "back.out(1.7)" : "power3.out",
        duration: candidate ? 0.9 : 0.6,
      },
    });
    tl.addLabel("lines")
      .fromTo(
        ".hero-line",
        { yPercent: 110, opacity: 0 },
        { yPercent: 0, opacity: 1, stagger: 0.08 },
      )
      .addLabel("underline", "-=0.25")
      .fromTo(
        ".hero-underline",
        { scaleX: 0 },
        { scaleX: 1, duration: 0.8, ease: "expo.out" },
        "underline",
      )
      .addLabel("actions", "<0.15")
      .fromTo(".hero-actions", { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1 }, "actions");
    motionprGsap.track(tl, "hero-intro");
  });
})();
