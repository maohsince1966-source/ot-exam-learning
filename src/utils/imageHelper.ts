/**
 * Image helper utilities to fix and normalize external image URLs (Google Drive, Dropbox, Gyazo, etc.)
 * and provide fallbacks when images fail to load.
 */

/**
 * Extracts Google Drive file ID from various Drive URL formats.
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  // Patterns:
  // 1. https://drive.google.com/file/d/FILE_ID/view...
  // 2. https://drive.google.com/open?id=FILE_ID
  // 3. https://drive.google.com/uc?id=FILE_ID or export=view&id=FILE_ID
  // 4. https://docs.google.com/file/d/FILE_ID/...
  // 5. https://drive.google.com/thumbnail?id=FILE_ID
  // 6. https://lh3.googleusercontent.com/d/FILE_ID

  const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  const lh3Match = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
  if (lh3Match && lh3Match[1]) return lh3Match[1];

  return null;
}

/**
 * Check if the URL belongs to Google Drive.
 */
export function isGoogleDriveUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('drive.google.com') || 
         url.includes('docs.google.com') || 
         url.includes('googleusercontent.com/d/');
}

/**
 * Normalizes an image URL into a directly loadable image format.
 * - Google Drive: converts sharing link to direct lh3 CDN endpoint
 * - Dropbox: changes ?dl=0 to ?raw=1
 * - Gyazo: ensures direct .png / .jpg extension
 */
export function normalizeImageUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const url = rawUrl.trim();

  // If already a Data URL or SVG, return as is
  if (url.startsWith('data:image/')) {
    return url;
  }

  // 1. Google Drive
  const driveFileId = extractGoogleDriveFileId(url);
  if (driveFileId) {
    // lh3.googleusercontent.com is Google's official direct CDN
    return `https://lh3.googleusercontent.com/d/${driveFileId}`;
  }

  // 2. Dropbox
  if (url.includes('dropbox.com')) {
    // Replace dl=0 with raw=1
    if (url.includes('?dl=0')) {
      return url.replace('?dl=0', '?raw=1');
    }
    if (url.includes('&dl=0')) {
      return url.replace('&dl=0', '&raw=1');
    }
    if (!url.includes('raw=1')) {
      return url.includes('?') ? `${url}&raw=1` : `${url}?raw=1`;
    }
    return url;
  }

  // 3. Gyazo (e.g. https://gyazo.com/1a2b3c -> https://i.gyazo.com/1a2b3c.png)
  const gyazoMatch = url.match(/https?:\/\/gyazo\.com\/([a-f0-9]+)$/i);
  if (gyazoMatch && gyazoMatch[1]) {
    return `https://i.gyazo.com/${gyazoMatch[1]}.png`;
  }

  return url;
}

/**
 * Generates an ordered list of fallback URLs to try when displaying an image.
 */
export function getImageUrlFallbacks(rawUrl: string): string[] {
  if (!rawUrl || typeof rawUrl !== 'string') return [];
  const url = rawUrl.trim();

  if (url.startsWith('data:image/')) {
    return [url];
  }

  const results: string[] = [];
  const driveFileId = extractGoogleDriveFileId(url);

  if (driveFileId) {
    // 1. Google CDN
    results.push(`https://lh3.googleusercontent.com/d/${driveFileId}`);
    // 2. Drive high-res thumbnail
    results.push(`https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1600`);
    // 3. Server-side proxy with original or direct
    results.push(`/api/proxy-image?url=${encodeURIComponent(`https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1600`)}`);
    // 4. uc?export=view
    results.push(`https://drive.google.com/uc?export=view&id=${driveFileId}`);
    // 5. Proxy with raw URL
    results.push(`/api/proxy-image?url=${encodeURIComponent(url)}`);
  } else {
    const normalized = normalizeImageUrl(url);
    if (normalized) {
      results.push(normalized);
    }
    if (normalized !== url) {
      results.push(url);
    }
    // Server proxy fallback
    results.push(`/api/proxy-image?url=${encodeURIComponent(normalized || url)}`);
  }

  // Deduplicate while preserving order
  return Array.from(new Set(results));
}

/**
 * Converts and optimizes an uploaded image file (PNG/JPG/WebP) to a Base64 data URL.
 * Automatically scales down large smartphone camera shots to prevent storage bloat.
 */
export function convertFileToOptimizedDataUrl(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to original data URL if canvas fails
          resolve(readerEvent.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try webp, fallback to jpeg
        try {
          const webpData = canvas.toDataURL('image/webp', quality);
          if (webpData.startsWith('data:image/webp')) {
            resolve(webpData);
            return;
          }
        } catch {
          // ignore
        }

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        reject(new Error('画像の読み込みに失敗しました。対応形式の画像ファイル（PNG, JPG, WebP）を選択してください。'));
      };
      img.src = readerEvent.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('ファイルの読み取りに失敗しました。'));
    };
    reader.readAsDataURL(file);
  });
}
