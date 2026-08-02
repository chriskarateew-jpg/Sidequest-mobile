// Gumpa — photo evidence capture. Two proof paths, chosen per-challenge by
// Challenge.proofType (see src/lib/data.ts):
//  - capturePhoto(): a real-world moment, gated behind the live camera —
//    never the gallery — so an old or internet-sourced photo can't be
//    submitted as proof.
//  - listScreenshotCandidates()/resolveScreenshotAsset(): proof of another
//    app's UI (a step count, a screen-time total). Camera-only capture can't
//    produce this (you can't photograph your own screen with your own
//    camera), so this instead reads from the OS's own screenshot
//    classification/album — never the general camera roll — so a
//    downloaded internet image can't be passed off as a screenshot.
// Both proof paths also attach a small resized "hash thumbnail" (for the
// server's app-wide duplicate-photo check) and a best-effort device location
// (for the server's local-challenge GPS check) — see server/src/complete.ts.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import { getCurrentPreciseLocation } from '@/lib/location';

// Matches the server's dHash grid (server/src/photo-hash.ts) — deliberately
// tiny so the server only ever decodes a handful of pixels for hashing,
// regardless of how large the original photo was.
const HASH_THUMBNAIL_WIDTH = 9;
const HASH_THUMBNAIL_HEIGHT = 8;
const SCREENSHOT_PAGE_SIZE = 60;

export type PhotoResult =
  | {
      status: 'ok';
      uri: string;
      base64: string;
      mediaType: string;
      hashThumbnailBase64?: string; // set on both proof paths below; unset for the decorative pickPhotoFromLibrary path
      lat?: number;
      lng?: number;
    }
  | { status: 'denied' }
  | { status: 'cancelled' };

// Resizes (non-uniformly — exact grid, not aspect-preserving) to a fixed
// tiny size and re-encodes, so the server can decode a near-nothing amount
// of pixel data to compute a difference-hash instead of a full-size photo —
// see the CPU-time note in server/src/photo-hash.ts for why.
async function buildHashThumbnail(uri: string): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).resize({ width: HASH_THUMBNAIL_WIDTH, height: HASH_THUMBNAIL_HEIGHT }).renderAsync();
  const result = await image.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 1 });
  return result.base64 ?? '';
}

// Precise, not the coarse suggestion-feature fetch — this feeds a real
// proximity check server-side (see server/src/complete.ts), which needs
// an accurate fix, not a ~1km-rounded one. The server rounds this down
// before it's ever persisted (recordPhotoHash in server/src/photo-hash.ts),
// so nothing more precise than before actually reaches storage. A denied/
// failed/too-imprecise-to-trust fix (see PreciseLocationResult) all fall
// through to the same {} here — omitting lat/lng skips the venue check for
// this submission rather than blocking it; camera-only capture and photo
// dedup still apply regardless.
async function attachedLocation(): Promise<{ lat?: number; lng?: number }> {
  const loc = await getCurrentPreciseLocation();
  return loc.status === 'ok' ? { lat: loc.lat, lng: loc.lng } : {};
}

export async function capturePhoto(): Promise<PhotoResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.5,
    allowsEditing: false,
    base64: true,
  });

  const asset = result.assets?.[0];
  if (result.canceled || !asset?.base64) return { status: 'cancelled' };

  const [hashThumbnailBase64, coords] = await Promise.all([buildHashThumbnail(asset.uri), attachedLocation()]);
  return { status: 'ok', uri: asset.uri, base64: asset.base64, mediaType: asset.mimeType ?? 'image/jpeg', hashThumbnailBase64, ...coords };
}

// For decorative pictures (e.g. a group's icon) — not proof, so the library
// is fine and doesn't need the "taken live" guarantee capturePhoto enforces.
// No hash/location attached — this never goes through /verify or /complete.
export async function pickPhotoFromLibrary(): Promise<PhotoResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.5,
    allowsEditing: true,
    aspect: [1, 1],
    base64: true,
  });

  const asset = result.assets?.[0];
  if (result.canceled || !asset?.base64) return { status: 'cancelled' };
  return { status: 'ok', uri: asset.uri, base64: asset.base64, mediaType: asset.mimeType ?? 'image/jpeg' };
}

export type ScreenshotCandidatesResult =
  | { status: 'ok'; assets: MediaLibrary.Asset[] }
  | { status: 'denied' }
  // Deliberately doesn't fall back to the unrestricted gallery picker on
  // this outcome — that would reopen the exact loophole this closes (an
  // internet-downloaded image passed off as a screenshot).
  | { status: 'no-screenshots-found' };

// Lists candidate screenshots for the picker UI (src/components/screenshot-
// picker.tsx) to render as a grid — doesn't read any image bytes itself.
export async function listScreenshotCandidates(): Promise<ScreenshotCandidatesResult> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  // iOS classifies screenshots as a media subtype directly — more reliable
  // than assuming a "Screenshots" album exists/is named that under every
  // locale/OS version, so this is queried straight off the library rather
  // than through an album lookup.
  if (Platform.OS === 'ios') {
    const { assets } = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      mediaSubtypes: 'screenshot',
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      first: SCREENSHOT_PAGE_SIZE,
    });
    if (assets.length === 0) return { status: 'no-screenshots-found' };
    return { status: 'ok', assets };
  }

  // Android has no subtype API — fall back to the standard "Screenshots"
  // album name (stock/Pixel/Samsung builds all use it).
  const album = await MediaLibrary.getAlbumAsync('Screenshots');
  if (!album) return { status: 'no-screenshots-found' };
  const { assets } = await MediaLibrary.getAssetsAsync({
    album,
    mediaType: 'photo',
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    first: SCREENSHOT_PAGE_SIZE,
  });
  if (assets.length === 0) return { status: 'no-screenshots-found' };
  return { status: 'ok', assets };
}

// Reads a chosen screenshot asset (from listScreenshotCandidates) into the
// same shape capturePhoto produces, so the rest of the submit flow
// (verifyPhoto/submitCompletion) doesn't need to know which path it came from.
export async function resolveScreenshotAsset(asset: MediaLibrary.Asset): Promise<PhotoResult> {
  const info = await MediaLibrary.getAssetInfoAsync(asset);
  const localUri = info.localUri ?? asset.uri;

  const [base64, hashThumbnailBase64, coords] = await Promise.all([
    new File(localUri).base64(),
    buildHashThumbnail(localUri),
    attachedLocation(),
  ]);

  const mediaType = asset.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { status: 'ok', uri: localUri, base64, mediaType, hashThumbnailBase64, ...coords };
}
