export class PhotoCompositor {
  public async composite(
    videoEl: HTMLVideoElement,
    filterUrl: string | null,
    mirrored: boolean
  ): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');

    // For better quality, use the video's intrinsic dimensions
    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;
    canvas.width = width;
    canvas.height = height;

    // Handle mirroring (selfie mode)
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    // Draw video
    ctx.drawImage(videoEl, 0, 0, width, height);

    // Reset transform before drawing filter
    if (mirrored) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Draw filter if active
    if (filterUrl && filterUrl !== 'none') {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
          resolve();
        };
        img.onerror = () => {
          console.warn('Failed to load filter image');
          resolve(); // Resolve anyway to save photo without filter
        };
        img.src = filterUrl;
      });
    }

    // Export to Blob (JPEG high quality)
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob from canvas'));
        },
        'image/jpeg',
        0.92
      );
    });
  }
}

export const photoCompositor = new PhotoCompositor();
