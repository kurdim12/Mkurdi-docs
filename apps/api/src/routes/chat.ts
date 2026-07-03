import { Hono } from 'hono';
import type { Env } from '../types';
import { embedQuery } from '../lib/embeddings';
import { chatCall, type ChatMessage } from '../lib/openrouter';
import { buildChatUserMessage, CHAT_SYSTEM, type ChatSource } from '../lib/prompts';

const MIN_SCORE = 0.35;
const TOP_K = 8;
const NO_ANSWER = 'لا تتوفر معلومات كافية في الوثائق المرفوعة للإجابة على هذا السؤال.';
const NO_DOCS =
  'لا توجد وثائق جاهزة في هذا المشروع بعد. ارفع ملفات PDF وانتظر اكتمال معالجتها ثم أعد المحاولة.';

const chat = new Hono<{ Bindings: Env }>();

interface RetrievedSource extends ChatSource {
  document_id: string;
  project_id: string;
  project: string;
  score: number;
}

async function retrieve(
  env: Env,
  query: string,
  projectId?: string
): Promise<RetrievedSource[]> {
  const vector = await embedQuery(env, query);
  const res = await env.VEC.query(vector, {
    topK: TOP_K,
    returnValues: false,
    returnMetadata: 'all',
    ...(projectId ? { filter: { project_id: { $eq: projectId } } } : {}),
  });
  const matches = res.matches.filter((m) => m.score >= MIN_SCORE);
  if (matches.length === 0) return [];

  const placeholders = matches.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.page, c.content, c.document_id, c.project_id,
            COALESCE(d.title, d.filename) AS title,
            p.name AS project
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     JOIN projects p ON p.id = c.project_id
     WHERE c.id IN (${placeholders})`
  )
    .bind(...matches.map((m) => m.id))
    .all<{
      id: string;
      page: number;
      content: string;
      document_id: string;
      project_id: string;
      title: string;
      project: string;
    }>();

  const byId = new Map(results.map((r) => [r.id, r]));
  const sources: RetrievedSource[] = [];
  for (const m of matches) {
    const row = byId.get(m.id);
    if (!row) continue;
    sources.push({
      n: sources.length + 1,
      document_id: row.document_id,
      project_id: row.project_id,
      project: row.project,
      title: row.title,
      page: row.page,
      content: row.content,
      score: m.score,
    });
  }
  return sources;
}

chat.post('/projects/:id/chat', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json<{
    message?: string;
    history?: Array<{ role: string; content: string }>;
  }>();
  const message = body.message?.trim();
  if (!message) return c.json({ error: 'message is required' }, 400);

  const persist = async (answer: string, sources: unknown[]) => {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO chat_messages (id, project_id, role, content) VALUES (?, ?, 'user', ?)`
      ).bind(crypto.randomUUID(), projectId, message),
      c.env.DB.prepare(
        `INSERT INTO chat_messages (id, project_id, role, content, sources_json) VALUES (?, ?, 'assistant', ?, ?)`
      ).bind(crypto.randomUUID(), projectId, answer, JSON.stringify(sources)),
    ]);
  };

  // Guard 1: no ready chunks for this project yet.
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM chunks WHERE project_id = ?`)
    .bind(projectId)
    .first<{ n: number }>();
  if (!count || count.n === 0) {
    return c.json({ answer: NO_DOCS, sources: [] });
  }

  const sources = await retrieve(c.env, message, projectId);

  // Guard 2: nothing survived the score threshold.
  if (sources.length === 0) {
    await persist(NO_ANSWER, []);
    return c.json({ answer: NO_ANSWER, sources: [] });
  }

  const history: ChatMessage[] = (body.history ?? [])
    .slice(-6)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }));

  const answer = await chatCall({
    apiKey: c.env.OPENROUTER_API_KEY,
    model: c.env.MODEL_CHAT,
    system: CHAT_SYSTEM,
    messages: [...history, { role: 'user', content: buildChatUserMessage(sources, message) }],
  });

  const out = sources.map((s) => ({
    n: s.n,
    document_id: s.document_id,
    title: s.title,
    page: s.page,
    snippet: s.content.slice(0, 180),
    score: s.score,
  }));
  await persist(answer, out);
  return c.json({ answer, sources: out });
});

chat.post('/search', async (c) => {
  const body = await c.req.json<{ query?: string; message?: string }>();
  const query = (body.query ?? body.message)?.trim();
  if (!query) return c.json({ error: 'query is required' }, 400);

  const sources = await retrieve(c.env, query);
  return c.json({
    results: sources.map((s) => ({
      title: s.title,
      page: s.page,
      snippet: s.content.slice(0, 180),
      score: s.score,
      project: s.project,
      project_id: s.project_id,
      document_id: s.document_id,
    })),
  });
});

export default chat;
