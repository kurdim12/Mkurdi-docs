import { Hono } from 'hono';
import type { Env } from '../types';

const documents = new Hono<{ Bindings: Env }>();

documents.post('/projects/:projectId/documents', async (c) => {
  const projectId = c.req.param('projectId');
  const project = await c.env.DB.prepare(`SELECT id FROM projects WHERE id = ?`)
    .bind(projectId)
    .first();
  if (!project) return c.json({ error: 'project not found' }, 404);

  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return c.json({ error: 'multipart field "file" is required' }, 400);
  }
  const filename = file.name || 'document.pdf';
  const extOk = filename.toLowerCase().endsWith('.pdf');
  const mimeOk = !file.type || file.type === 'application/pdf';
  if (!extOk || !mimeOk) {
    return c.json({ error: 'only PDF files are accepted' }, 400);
  }

  const documentId = crypto.randomUUID();
  const r2Key = `docs/${projectId}/${crypto.randomUUID()}.pdf`;
  await c.env.DOCS.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: 'application/pdf' },
  });
  await c.env.DB.prepare(
    `INSERT INTO documents (id, project_id, r2_key, filename, status) VALUES (?, ?, ?, ?, 'processing')`
  )
    .bind(documentId, projectId, r2Key, filename)
    .run();

  await c.env.INGEST.create({
    id: documentId,
    params: { documentId, projectId, r2Key, filename },
  });

  const row = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ?`)
    .bind(documentId)
    .first();
  return c.json(row, 201);
});

documents.get('/projects/:projectId/documents', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, filename, doc_type, status, error, page_count, language, title, ref_number, doc_date, summary
     FROM documents WHERE project_id = ? ORDER BY created_at DESC`
  )
    .bind(c.req.param('projectId'))
    .all();
  return c.json({ documents: results });
});

documents.get('/documents/:id', async (c) => {
  const id = c.req.param('id');
  const doc = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ?`).bind(id).first<{
    doc_type: string;
  }>();
  if (!doc) return c.json({ error: 'document not found' }, 404);

  let ledger: unknown = null;
  if (doc.doc_type === 'letter_in' || doc.doc_type === 'letter_out') {
    ledger = await c.env.DB.prepare(`SELECT * FROM letters WHERE document_id = ?`).bind(id).first();
  } else if (doc.doc_type === 'guarantee') {
    ledger = await c.env.DB.prepare(`SELECT * FROM guarantees WHERE document_id = ?`)
      .bind(id)
      .first();
  } else if (doc.doc_type === 'ipc') {
    ledger = await c.env.DB.prepare(`SELECT * FROM ipcs WHERE document_id = ?`).bind(id).first();
  }
  return c.json({ document: doc, ledger });
});

export default documents;
