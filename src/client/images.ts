"use client";

import {
  IMAGE_MEDIA_TYPES,
  type ImageMediaType,
  MAX_IMAGE_CHARS,
  type PromptImage,
} from "@/lib/types";

const MAX_EDGE = 2000;
const MAX_BYTES = (MAX_IMAGE_CHARS / 4) * 3;
const JPEG_QUALITIES = [0.9, 0.8, 0.65];

export type ImageDraft = { id: string; mediaType: ImageMediaType; url: string };

function isMediaType(type: string): type is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(type);
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function redraw(bitmap: ImageBitmap, scale: number, lossless: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;

  if (lossless) {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await toBlob(canvas, "image/png");
    if (png && png.size <= MAX_BYTES) return png;
  }

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of JPEG_QUALITIES) {
    const jpeg = await toBlob(canvas, "image/jpeg", quality);
    if (jpeg && jpeg.size <= MAX_BYTES) return jpeg;
  }
  return null;
}

export async function readImage(file: File): Promise<Omit<ImageDraft, "id">> {
  const name = file.name || "that image";
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(`Could not read ${name}.`);

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const type = file.type;
    if (scale === 1 && isMediaType(type) && file.size <= MAX_BYTES) {
      return { mediaType: type, url: await toDataUrl(file) };
    }

    const blob = await redraw(bitmap, scale, type === "image/png" || type === "image/gif");
    if (!blob || !isMediaType(blob.type)) throw new Error(`Could not shrink ${name} to send.`);
    return { mediaType: blob.type, url: await toDataUrl(blob) };
  } finally {
    bitmap.close();
  }
}

export function toPromptImage(draft: ImageDraft): PromptImage {
  return { data: draft.url.slice(draft.url.indexOf(",") + 1), mediaType: draft.mediaType };
}
