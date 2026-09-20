export function extractGoogleDriveFileId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  const lh3Match = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
  if (lh3Match && lh3Match[1]) return lh3Match[1];

  return null;
}

export function isGoogleDriveUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('drive.google.com') || 
         url.includes('docs.google.com') || 
         url.includes('googleusercontent.com/d/');
}

export function normalizeImageUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const url = rawUrl.trim();

  if (url.startsWith('data:image/')) {
    return url;
  }

  const driveFileId = extractGoogleDriveFileId(url);
  if (driveFileId) {
    return `https://lh3.googleusercontent.com/d/${driveFileId}`;
  }

  if (url.includes('dropbox.com')) {
    if (url.includes('?dl=0')) return url.replace('?dl=0', '?raw=1');
    if (url.includes('&dl=0')) return url.replace('&dl=0', '&raw=1');
    if (!url.includes('raw=1')) return url.includes('?') ? `${url}&raw=1` : `${url}?raw=1`;
    return url;
  }

  const gyazoMatch = url.match(/https?:\/\/gyazo\.com\/([a-f0-9]+)$/i);
  if (gyazoMatch && gyazoMatch[1]) {
    return `https://i.gyazo.com/${gyazoMatch[1]}.png`;
  }

  return url;
}

export function getImageUrlFallbacks(rawUrl: string): string[] {
  if (!rawUrl || typeof rawUrl !== 'string') return [];
  const url = rawUrl.trim();

  if (url.startsWith('data:image/')) {
    return [url];
  }

  const results: string[] = [];
  const driveFileId = extractGoogleDriveFileId(url);

  if (driveFileId) {
    results.push(`https://lh3.googleusercontent.com/d/${driveFileId}`);
    results.push(`https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1600`);
    results.push(`/api/proxy-image?url=${encodeURIComponent(`https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1600`)}`);
    results.push(`https://drive.google.com/uc?export=view&id=${driveFileId}`);
  } else {
    const normalized = normalizeImageUrl(url);
    if (normalized) results.push(normalized);
    if (normalized !== url) results.push(url);
    results.push(`/api/proxy-image?url=${encodeURIComponent(normalized || url)}`);
  }

  return Array.from(new Set(results));
}
