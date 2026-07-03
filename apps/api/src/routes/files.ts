import { Hono } from 'hono';
import type { Env } from '../types';
import { verifyFileSig } from '../lib/sign';

const files = new Hono<{ Bindings: Env }>();

// HMAC-signed, time-limited PDF access. Exempt from the x-api-key gate so
// OpenRouter can fetch the file when PARSE_MODE = "url".
files.get('/files/:documentId', async (c) => {
  const documentId = c.req.param('documentId');
  const exp = c.req.query('exp');
  const sig = c.req.query('sig');
  if (
    !exp ||
    !sig ||
    !(await verifyFileSig(c.env.SIGNING_SECRET, documentId, exp, sig))
  ) {
    return c.json({ error: 'invalid or expired signature' }, 403);
  }
  const doc = await c.env.DB.prepare(`SELECT r2_key, filename FROM documents WHERE id = ?`)
    .bind(documentId)
    .first<{ r2_key: string; filename: string }>();
  if (!doc) return c.json({ error: 'document not found' }, 404);
  const obj = await c.env.DOCS.get(doc.r2_key);
  if (!obj) return c.json({ error: 'file not found' }, 404);
  return new Response(obj.body as ReadableStream, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="document.pdf"',
    },
  });
});

export default files;
