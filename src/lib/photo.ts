// Sidequest — photo evidence capture.
// Every quest completion is gated behind an actual camera shot, taken in
// the moment, so tokens can't be claimed without proof.

import * as ImagePicker from 'expo-image-picker';

export type PhotoResult =
  | { status: 'ok'; uri: string; base64: string; mediaType: string }
  | { status: 'denied' }
  | { status: 'cancelled' };

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
  return { status: 'ok', uri: asset.uri, base64: asset.base64, mediaType: asset.mimeType ?? 'image/jpeg' };
}

// For decorative pictures (e.g. a group's icon) — not proof, so the library
// is fine and doesn't need the "taken live" guarantee capturePhoto enforces.
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
