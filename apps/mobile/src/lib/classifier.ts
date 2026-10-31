/**
 * On-device waste classifier (MobileNetV2 transfer learning → TensorFlow Lite, see ml/train_classifier.py).
 * Input: float32 [1,224,224,3] raw RGB 0..255 (normalisation is inside the model). Output: 6 softmax scores.
 * Works fully offline; the photo never leaves the phone.
 */
import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import { SORT_CLASSES, type SortClass } from '@sw/shared';

const SIZE = 224;
let model: Promise<TensorflowModel> | null = null;

function getModel() {
  model ??= loadTensorflowModel(require('../../assets/model/waste_classifier.tflite'), []);
  return model;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface Classification { label: SortClass; confidence: number; scores: { label: SortClass; score: number }[]; ms: number }

export async function classify(uri: string): Promise<Classification> {
  const m = await getModel();
  const ref = await ImageManipulator.manipulate(uri).resize({ width: SIZE, height: SIZE }).renderAsync();
  const img = await ref.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 0.95 });
  const { data, width, height } = jpeg.decode(base64ToBytes(img.base64!), { useTArray: true, formatAsRGBA: true });
  if (width !== SIZE || height !== SIZE) throw new Error('Unexpected image size');
  const input = new Float32Array(SIZE * SIZE * 3);
  for (let p = 0, i = 0; p < data.length; p += 4) {
    input[i++] = data[p]!; input[i++] = data[p + 1]!; input[i++] = data[p + 2]!;
  }
  const t0 = Date.now();
  const [out] = await m.run([input.buffer]);
  const ms = Date.now() - t0;
  const probs = Array.from(new Float32Array(out as ArrayBuffer));
  const scores = SORT_CLASSES.map((label, i) => ({ label, score: probs[i] ?? 0 })).sort((a, b) => b.score - a.score);
  return { label: scores[0]!.label, confidence: scores[0]!.score, scores, ms };
}

/** Warm the model up in the background so the first photo is fast. */
export function preloadClassifier() {
  getModel().catch((e) => console.warn('classifier not loaded', e));
}
