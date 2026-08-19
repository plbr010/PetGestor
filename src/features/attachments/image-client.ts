"use client";

const DEFAULT_MAX_WIDTH = 1024;
const THUMB_MAX_WIDTH = 256;
const WEBP_QUALITY = 0.78;
const THUMB_QUALITY = 0.7;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("blob_failed"));
          return;
        }

        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

async function resizeToBlob(
  image: HTMLImageElement,
  maxWidth: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxWidth / image.width);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("canvas_context_failed");
  }

  ctx.drawImage(image, 0, 0, width, height);
  return canvasToBlob(canvas, quality);
}

export type PreparedImageUpload = {
  optimized: Blob;
  thumb: Blob;
  optimizedSize: number;
  thumbSize: number;
};

export async function prepareImageUpload(
  file: File,
  maxWidth = DEFAULT_MAX_WIDTH,
): Promise<PreparedImageUpload> {
  const image = await loadImageFromFile(file);
  const [optimized, thumb] = await Promise.all([
    resizeToBlob(image, maxWidth, WEBP_QUALITY),
    resizeToBlob(image, THUMB_MAX_WIDTH, THUMB_QUALITY),
  ]);

  return {
    optimized,
    thumb,
    optimizedSize: optimized.size,
    thumbSize: thumb.size,
  };
}

export function shouldOptimizeImage(file: File): boolean {
  return file.type.startsWith("image/") && file.type !== "image/webp";
}
