/**
 * Privacy helpers. MotionPR records page URLs in capture files and reports; query strings often
 * carry tokens, emails or session ids, so their values are redacted by default.
 */
export function redactUrl(
  url: string,
  options: { redactQueryParams: boolean; allowQueryParams: readonly string[] },
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  parsed.username = "";
  parsed.password = "";
  if (options.redactQueryParams) {
    const entries = [...parsed.searchParams.entries()].map(
      ([key, value]) => [key, options.allowQueryParams.includes(key) ? value : "REDACTED"] as const,
    );
    parsed.search = new URLSearchParams(entries.map(([k, v]) => [k, v])).toString();
    if (parsed.hash.length > 1 && /[=&]/.test(parsed.hash)) parsed.hash = "#REDACTED";
  }
  return parsed.toString();
}

/** Strips characters that could break out of HTML/JSON contexts when embedding JSON in a <script>. */
export function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(String.fromCharCode(0x2028), "\\u2028")
    .replaceAll(String.fromCharCode(0x2029), "\\u2029");
}
