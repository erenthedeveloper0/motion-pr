// Real demo-capture data (apps/docs/data/site-data.json), fetched once per page load.
let promise;
export function root() {
  return document.querySelector('meta[name="mp-root"]')?.content ?? "";
}
export function siteUrl(path) {
  return new URL(root() + path, location.href).href;
}
export function loadSiteData() {
  promise ??= fetch(siteUrl("assets/data/site-data.json")).then((r) => {
    if (!r.ok) throw new Error(`site data: HTTP ${r.status}`);
    return r.json();
  });
  return promise;
}
export async function dataset(key) {
  const data = await loadSiteData();
  const set = data.datasets[key];
  if (!set) throw new Error(`no dataset ${key}`);
  return { data, set };
}
/** "motionpr-id:nav-panel" → "nav-panel"; engine labels as the report shows them. */
export const shortKey = (k) => k.replace(/^(motionpr-id|test-id|id|aria):/, "");
export const ENGINE_LABEL = { native: "Native", gsap: "GSAP", animejs: "Anime.js", lenis: "Lenis" };
export function engineOf(source, type) {
  if (source === "native") return type === "web-animation" ? "WAAPI" : "Native CSS";
  return ENGINE_LABEL[source] ?? source ?? "—";
}
