/**
 * Shrink a photo before upload: phones take 12-megapixel photos, and the
 * models resize them to about 1,500 px anyway. A long edge of 2,000 px keeps
 * the detail that matters and stays well under the providers' size limits.
 */
export async function downscale(file: File, maxEdge = 2000, quality = 0.86): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // a format the browser can't decode (e.g. HEIC on some browsers): let the server decide
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 2_000_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
}
