/**
 * dhash — perceptual hash for scene-change detection.
 *
 * Reduces a frame to a 64-bit fingerprint by:
 *   1. Downscale to 9 × 8 grayscale.
 *   2. For each row, compare adjacent pixels → 8 bits × 8 rows = 64 bits.
 *
 * Hamming distance between two hashes ≈ how much the scene changed.
 * 0–4 bits: visually identical (camera shake, lighting flicker).
 * 5–15 bits: small change (subject moved, panned slightly).
 * 16+ bits: substantial change (new scene).
 *
 * Returned as a hex string (16 chars) so it's easy to compare and log.
 */

const HASH_W = 9;
const HASH_H = 8;

/**
 * Compute the dhash of an HTMLCanvasElement (or anything drawable to canvas).
 * Returns null if the canvas is empty or 2d context isn't available.
 */
export function dhashFromCanvas(source: HTMLCanvasElement): string | null {
  const tmp = document.createElement("canvas");
  tmp.width = HASH_W;
  tmp.height = HASH_H;
  const ctx = tmp.getContext("2d");
  if (!ctx) return null;

  // Draw the source scaled down to the tiny hash canvas.
  ctx.drawImage(source, 0, 0, HASH_W, HASH_H);
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, HASH_W, HASH_H);
  } catch {
    // CORS-tainted canvas. Caller has to use same-origin frames.
    return null;
  }

  // Convert to grayscale luma.
  const luma = new Array<number>(HASH_W * HASH_H);
  for (let i = 0; i < HASH_W * HASH_H; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Build 64 bits: for each row, compare each column pair (x vs x+1).
  let bits = "";
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      const left = luma[y * HASH_W + x];
      const right = luma[y * HASH_W + x + 1];
      bits += left > right ? "1" : "0";
    }
  }

  // 64 bits → 16 hex chars.
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** Hamming distance between two 16-char hex hashes. Returns 0–64. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    // Count set bits in this nibble (popcount of 4 bits).
    dist += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return dist;
}

/** Buckets the distance into a useful change category. */
export type SceneChange = "same" | "small" | "large";

export function classifySceneChange(distance: number): SceneChange {
  if (distance <= 4) return "same";
  if (distance <= 15) return "small";
  return "large";
}
