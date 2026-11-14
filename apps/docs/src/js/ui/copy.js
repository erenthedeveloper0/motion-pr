// Copy buttons (code blocks, install commands, tabs). One delegated listener for the whole site.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts without the async clipboard (older browsers, some iframes).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(ta);
    ta.select();
    let ok;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function textOf(target) {
  // Shiki renders one .line per source line; join them so blank lines survive.
  const lines = target.querySelectorAll(".line");
  if (lines.length)
    return [...lines]
      .map((l) => l.textContent)
      .join("\n")
      .replace(/\n+$/, "");
  return target.textContent.trim();
}

export function initCopy() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("button.copy");
    if (!button) return;
    let target = button.dataset.copy ? document.getElementById(button.dataset.copy) : null;
    if (button.dataset.copyPanel) {
      const tabs = button.closest(".code-tabs");
      target = tabs?.querySelector('[role="tabpanel"]:not([hidden]) .code-body');
    }
    if (!target) return;
    const ok = await writeClipboard(textOf(target));
    const label = button.querySelector(".copy-label");
    button.classList.toggle("is-copied", ok);
    if (label) label.textContent = ok ? "Copied" : "Press ⌘C";
    if (ok && !reducedMotion())
      gsap.fromTo(button, { scale: 0.92 }, { scale: 1, duration: DUR.slow, ease: EASE.out });
    const live = document.querySelector("[data-route-announcer]");
    if (live) live.textContent = ok ? "Copied to clipboard" : "Copy failed";
    clearTimeout(Number(button.dataset.timer));
    button.dataset.timer = String(
      setTimeout(() => {
        button.classList.remove("is-copied");
        if (label) label.textContent = "Copy";
      }, 1600),
    );
  });
}
