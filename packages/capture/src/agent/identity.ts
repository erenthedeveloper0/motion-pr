import { cssAttrValue, isLikelyGeneratedId, sanitizeLabel } from "@motionpr/core/identity";
import type { RawElementIdentity } from "@motionpr/core/protocol";

export interface IdentityOptions {
  motionprIdAttribute: string;
  testIdAttribute: string;
}

interface Strong {
  key: string;
  selector: string;
  method: RawElementIdentity["method"];
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function isUnique(selector: string, root: ParentNode = document): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/** High/medium confidence identity of an element, or null when it has none. */
function strongIdentity(el: Element, options: IdentityOptions): Strong | null {
  const mid = el.getAttribute(options.motionprIdAttribute);
  if (mid) {
    return {
      key: `motionpr-id:${mid}`,
      selector: `[${options.motionprIdAttribute}="${cssAttrValue(mid)}"]`,
      method: "motionpr-id",
    };
  }
  const tid = el.getAttribute(options.testIdAttribute);
  if (tid) {
    return {
      key: `test-id:${tid}`,
      selector: `[${options.testIdAttribute}="${cssAttrValue(tid)}"]`,
      method: "test-id",
    };
  }
  const id = el.id;
  if (id && !isLikelyGeneratedId(id) && isUnique(`#${cssEscape(id)}`)) {
    return { key: `id:${id}`, selector: `#${cssEscape(id)}`, method: "dom-id" };
  }
  return null;
}

/** Accessible-name based identity for interactive elements with a unique label. */
function ariaIdentity(el: Element): Strong | null {
  const tag = el.tagName.toLowerCase();
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    const selector = `${tag}[aria-label="${cssAttrValue(ariaLabel)}"]`;
    if (isUnique(selector)) return { key: `aria:${tag}[${ariaLabel}]`, selector, method: "aria" };
  }
  const role = el.getAttribute("role");
  if (
    (tag === "button" ||
      tag === "a" ||
      role === "button" ||
      role === "tab" ||
      role === "menuitem") &&
    !el.children.length
  ) {
    const text = sanitizeLabel(el.textContent, 40);
    if (text) {
      const sameTag = Array.from(
        document.querySelectorAll(role ? `${tag}[role="${cssAttrValue(role)}"]` : tag),
      );
      const matches = sameTag.filter((other) => sanitizeLabel(other.textContent, 40) === text);
      if (matches.length === 1) {
        // :nth-of-type keeps the selector usable with querySelector; the key stays text-based.
        return {
          key: `aria:${role ?? tag}[${text}]`,
          selector: domPath(el, null).selector,
          method: "aria",
        };
      }
    }
  }
  return null;
}

function segment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  return siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(el) + 1})` : tag;
}

/** Path from the nearest strongly identified ancestor (or <body>) down to the element. */
function domPath(
  el: Element,
  anchor: { el: Element; strong: Strong } | null,
): { key: string; selector: string } {
  const parts: string[] = [];
  let current: Element | null = el;
  const stop = anchor?.el ?? document.body;
  while (current && current !== stop && current !== document.documentElement) {
    parts.unshift(segment(current));
    current = current.parentElement;
  }
  const chain = parts.join(">");
  if (anchor) {
    return {
      key: `path:${anchor.strong.key}>${chain}`,
      selector: `${anchor.strong.selector} > ${parts.join(" > ")}`,
    };
  }
  return { key: `path:body>${chain}`, selector: `body > ${parts.join(" > ")}` };
}

function labelOf(el: Element): string | undefined {
  const tag = el.tagName.toLowerCase();
  const explicit =
    el.getAttribute("aria-label") ?? el.getAttribute("alt") ?? el.getAttribute("title");
  if (explicit) return sanitizeLabel(explicit, 48);
  // Never read text from form controls: their content may be user input.
  if (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  )
    return undefined;
  // innerText follows rendering (spaces between blocks); textContent would glue words together.
  const text = el instanceof HTMLElement ? el.innerText : el.textContent;
  return sanitizeLabel(text, 48);
}

/**
 * Identifies an element for cross-capture matching, preferring explicit attributes:
 * data-motionpr-id → data-testid → stable unique id → accessible label → anchored DOM path.
 */
export function identifyElement(
  el: Element,
  pseudoElement: string | null | undefined,
  options: IdentityOptions,
): RawElementIdentity {
  const tag = el.tagName.toLowerCase();
  const suffix = pseudoElement ? pseudoElement : "";
  const base = { tag, label: labelOf(el), ...(pseudoElement ? { pseudoElement } : {}) };

  const strong = strongIdentity(el, options);
  if (strong) {
    return {
      ...base,
      key: strong.key + suffix,
      selector: strong.selector,
      method: strong.method,
      confidence: strong.method === "dom-id" ? "medium" : "high",
      warnings: [],
    };
  }
  const aria = ariaIdentity(el);
  if (aria) {
    return {
      ...base,
      key: aria.key + suffix,
      selector: aria.selector,
      method: "aria",
      confidence: "medium",
      warnings: ["Identified by accessible label; changing the label breaks matching."],
    };
  }

  let anchor: { el: Element; strong: Strong } | null = null;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = strongIdentity(p, options);
    if (s) {
      anchor = { el: p, strong: s };
      break;
    }
  }
  const path = domPath(el, anchor);
  return {
    ...base,
    key: path.key + suffix,
    selector: path.selector,
    method: "dom-path",
    confidence: "low",
    ...(anchor ? { anchor: anchor.strong.key } : {}),
    warnings: [
      anchor
        ? `Matched by DOM position under ${anchor.strong.key}. Add ${options.motionprIdAttribute} for a reliable match.`
        : `Matched by DOM position from <body>. Add ${options.motionprIdAttribute} for a reliable match.`,
    ],
  };
}
