// Gumpa — app-wide duplicate-photo detection via a difference hash (dHash).
// Catches a photo forwarded between accounts (or reused across challenges)
// while still allowing two independent photos of a similar scene (different
// angle/composition) — see complete.ts for where this gates a submission.
//
// Decodes only a small pre-resized thumbnail the client already produced
// (src/lib/photo.ts's buildHashThumbnail — always encoded as JPEG regardless
// of the original photo's format, so this only ever needs a JPEG decoder),
// never the full-size proof photo. Workers' free-tier CPU-time-per-request
// limit (~10ms) makes decoding a full-size image via WASM a real risk of
// hitting that ceiling; decoding a 9x8-pixel thumbnail is trivial regardless
// of the WASM module's own instantiation cost. This is a deliberate trust
// trade-off — the server still computes the hash itself (never trusts a
// client-sent hash value), but trusts the client to have resized honestly.
// Tampering with just the thumbnail while still passing Claude's independent
// full-photo verification is a narrow, low-value attack, and this is one of
// three layered defenses (see also: camera-only capture, GPS-binding), not
// the only one.

import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode';
// wrangler's bundler resolves this to a compiled WebAssembly.Module — see
// server/src/types/wasm.d.ts for the ambient module declaration.
import mozjpegWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';

import type { Env } from './env';
import { base64ToBytes } from './http';

// Matches src/lib/photo.ts's HASH_THUMBNAIL_WIDTH/HEIGHT — 9 columns gives 8
// adjacent-pixel comparisons per row, times 8 rows, for a 64-bit hash.
const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const DUPLICATE_THRESHOLD_BITS = 5; // Hamming distance out of 64 bits — tunable
const RECENT_HASHES_LIMIT = 5000; // full-scan is cheap at current app scale; revisit (index/shard) if this table grows large

let jpegReady: Promise<void> | null = null;
async function ensureJpegReady(): Promise<void> {
  if (!jpegReady) jpegReady = initJpegDecode(mozjpegWasm as WebAssembly.Module);
  await jpegReady;
}

export async function computeDHash(thumbnailBase64: string): Promise<string> {
  await ensureJpegReady();
  const bytes = base64ToBytes(thumbnailBase64);
  const imageData = await decodeJpeg(bytes.buffer as ArrayBuffer);

  // Grid-sample defensively — the client always sends an already-9x8
  // thumbnail, but this doesn't assume it.
  const gray: number[] = new Array(HASH_WIDTH * HASH_HEIGHT);
  for (let row = 0; row < HASH_HEIGHT; row++) {
    const srcY = Math.min(imageData.height - 1, Math.floor((row / HASH_HEIGHT) * imageData.height));
    for (let col = 0; col < HASH_WIDTH; col++) {
      const srcX = Math.min(imageData.width - 1, Math.floor((col / HASH_WIDTH) * imageData.width));
      const idx = (srcY * imageData.width + srcX) * 4;
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];
      gray[row * HASH_WIDTH + col] = (r + g + b) / 3;
    }
  }

  let bits = 0n;
  for (let row = 0; row < HASH_HEIGHT; row++) {
    for (let col = 0; col < HASH_WIDTH - 1; col++) {
      const left = gray[row * HASH_WIDTH + col];
      const right = gray[row * HASH_WIDTH + col + 1];
      bits = (bits << 1n) | (left > right ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

function hammingDistance(hexA: string, hexB: string): number {
  let v = BigInt('0x' + hexA) ^ BigInt('0x' + hexB);
  let count = 0;
  while (v > 0n) {
    count += Number(v & 1n);
    v >>= 1n;
  }
  return count;
}

export async function findDuplicateHash(env: Env, hash: string): Promise<boolean> {
  const { results } = await env.DB.prepare('SELECT phash FROM photo_hashes ORDER BY created_at DESC LIMIT ?')
    .bind(RECENT_HASHES_LIMIT)
    .all<{ phash: string }>();
  if (!results) return false;
  return results.some((row) => hammingDistance(row.phash, hash) <= DUPLICATE_THRESHOLD_BITS);
}

// The client now sends a precise GPS fix (see src/lib/photo.ts) so the
// venue-distance check in complete.ts can compare against it accurately —
// but nothing more precise than the app's existing coarse-location norm
// should actually reach storage, so this rounds to the same ~1km grid
// src/lib/location.ts's getCurrentRoundedLocation uses, right at the point
// of persisting. Callers (complete.ts) must do their distance comparison
// against the raw value *before* calling this — this is the write boundary,
// not something to round earlier.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function recordPhotoHash(
  env: Env,
  params: { userId: string; challengeId: string; hash: string; lat?: number; lng?: number }
): Promise<void> {
  const lat = params.lat != null ? round2(params.lat) : null;
  const lng = params.lng != null ? round2(params.lng) : null;
  await env.DB.prepare(
    'INSERT INTO photo_hashes (id, user_id, challenge_id, phash, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), params.userId, params.challengeId, params.hash, lat, lng, Date.now())
    .run();
}
