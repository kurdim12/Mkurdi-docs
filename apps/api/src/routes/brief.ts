import { Hono } from 'hono';
import type { Env } from '../types';

const brief = new Hono<{ Bindings: Env }>();

const DAY_MS = 86400000;

function daysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / DAY_MS);
}

brief.get('/brief', async (c) => {
  const [letters, guarantees, ipcs] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT l.*, p.name AS project_name
       FROM letters l JOIN projects p ON p.id = l.project_id
       WHERE l.requires_reply = 1 AND l.status = 'open'
       ORDER BY (l.reply_deadline IS NULL), l.reply_deadline ASC
       LIMIT 25`
    ),
    c.env.DB.prepare(
      `SELECT g.*, p.name AS project_name
       FROM guarantees g JOIN projects p ON p.id = g.project_id
       WHERE g.status = 'active' AND date(g.expiry_date) <= date('now', '+45 day')
       ORDER BY g.expiry_date ASC
       LIMIT 25`
    ),
    c.env.DB.prepare(
      `SELECT i.*, p.name AS project_name
       FROM ipcs i JOIN projects p ON p.id = i.project_id
       WHERE i.status != 'paid'
       ORDER BY i.created_at DESC
       LIMIT 25`
    ),
  ]);

  type Row = Record<string, unknown>;
  const letterRows = ((letters?.results ?? []) as Row[]).map((l) => ({
    ...l,
    days_left: daysLeft((l.reply_deadline as string | null) ?? null),
  }));
  const guaranteeRows = ((guarantees?.results ?? []) as Row[]).map((g) => ({
    ...g,
    days_left: daysLeft((g.expiry_date as string | null) ?? null),
  }));

  return c.json({
    generated_at: new Date().toISOString(),
    letters: letterRows,
    guarantees: guaranteeRows,
    ipcs: ipcs?.results ?? [],
  });
});

export default brief;
