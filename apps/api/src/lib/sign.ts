const TTL_MS = 20 * 60 * 1000; // 20 minutes

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Short-lived HMAC-signed URL so OpenRouter can fetch the PDF without the api-key gate. */
export async function signedFileUrl(
  publicApiUrl: string,
  secret: string,
  documentId: string
): Promise<string> {
  const exp = Date.now() + TTL_MS;
  const sig = await hmacHex(secret, `${documentId}.${exp}`);
  const base = publicApiUrl.replace(/\/$/, '');
  return `${base}/files/${documentId}?exp=${exp}&sig=${sig}`;
}

export async function verifyFileSig(
  secret: string,
  documentId: string,
  exp: string,
  sig: string
): Promise<boolean> {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || Date.now() > expNum) return false;
  const expected = await hmacHex(secret, `${documentId}.${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

/** 32KB slices avoid call-stack overflow on big PDFs. */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const SLICE = 32768;
  let binary = '';
  for (let i = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + SLICE));
  }
  return btoa(binary);
}
