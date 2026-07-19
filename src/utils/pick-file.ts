import * as DocumentPicker from 'expo-document-picker';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import type { PickedFile } from '@/services/ingestion';

/** Opens the system file picker (PDF/image), returning null if the user cancels. Shared between
 * library.tsx's upload flow and the lecture-recording screen's "attach slides" step. */
export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'] });
  if (result.canceled) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    base64: () => readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 }),
  };
}

/** Requests camera permission and opens the camera, returning null if denied or canceled. */
export async function pickPhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Camera access needed',
      'Enable camera access for Lumora in your device settings to photograph study material.'
    );
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? `Photo ${new Date().toLocaleDateString()}`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    base64: () => readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 }),
  };
}
