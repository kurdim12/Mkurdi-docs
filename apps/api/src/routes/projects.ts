import { Hono } from 'hono';
import type { Env } from '../types';

const projects = new Hono<{ Bindings: Env }>();

projects.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*,
       (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS doc_count,
       (SELECT COUNT(*) FROM letters l
         WHERE l.project_id = p.id AND l.requires_reply = 1 AND l.status = 'open') AS open_letters
     FROM projects p
     ORDER BY p.created_at DESC`
  ).all();
  return c.json({ projects: results });
});

projects.post('/', async (c) => {
  const body = await c.req.json<{
    name?: string;
    client_name?: string;
    contract_value?: number;
    currency?: string;
    start_date?: string;
  }>();
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO projects (id, name, client_name, contract_value, currency, start_date)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.name.trim(),
      body.client_name ?? null,
      body.contract_value ?? null,
      body.currency ?? 'JOD',
      body.start_date ?? null
    )
    .run();
  const row = await c.env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  return c.json(row, 201);
});

projects.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [project, letters, guarantees, ipcs] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id),
    c.env.DB.prepare(
      `SELECT * FROM letters WHERE project_id = ? ORDER BY (reply_deadline IS NULL), reply_deadline ASC, created_at DESC`
    ).bind(id),
    c.env.DB.prepare(
      `SELECT * FROM guarantees WHERE project_id = ? ORDER BY (expiry_date IS NULL), expiry_date ASC`
    ).bind(id),
    c.env.DB.prepare(`SELECT * FROM ipcs WHERE project_id = ? ORDER BY created_at DESC`).bind(id),
  ]);
  const row = project?.results?.[0];
  if (!row) return c.json({ error: 'project not found' }, 404);
  return c.json({
    project: row,
    letters: letters?.results ?? [],
    guarantees: guarantees?.results ?? [],
    ipcs: ipcs?.results ?? [],
  });
});

export default projects;
