import { createHash } from "node:crypto";

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Short content hash used for content-addressed asset ids. */
export function contentId(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 20);
}
