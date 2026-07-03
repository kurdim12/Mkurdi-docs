import { Hono } from 'hono';
import type { Env } from '../types';
import { chatCall } from '../lib/openrouter';
import { LETTER_SYSTEM } from '../lib/prompts';

const letters = new Hono<{ Bindings: Env }>();

letters.post('/letters/generate', async (c) => {
  const body = await c.req.json<{
    instructions?: string;
    project_id?: string;
    reply_to_document_id?: string;
  }>();
  const instructions = body.instructions?.trim();
  if (!instructions) return c.json({ error: 'instructions is required' }, 400);

  const contextLines: string[] = [];

  if (body.project_id) {
    const project = await c.env.DB.prepare(
      `SELECT name, client_name FROM projects WHERE id = ?`
    )
      .bind(body.project_id)
      .first<{ name: string; client_name: string | null }>();
    if (project) {
      contextLines.push(`المشروع: ${project.name}`);
      if (project.client_name) contextLines.push(`صاحب العمل / العميل: ${project.client_name}`);
    }
  }

  if (body.reply_to_document_id) {
    const doc = await c.env.DB.prepare(
      `SELECT d.title, d.ref_number, d.doc_date, d.summary,
              l.sender, l.subject, l.action_required
       FROM documents d
       LEFT JOIN letters l ON l.document_id = d.id
       WHERE d.id = ?`
    )
      .bind(body.reply_to_document_id)
      .first<{
        title: string | null;
        ref_number: string | null;
        doc_date: string | null;
        summary: string | null;
        sender: string | null;
        subject: string | null;
        action_required: string | null;
      }>();
    if (doc) {
      contextLines.push('هذا الكتاب هو ردّ على الكتاب التالي:');
      if (doc.sender) contextLines.push(`الجهة المرسلة: ${doc.sender}`);
      if (doc.ref_number) contextLines.push(`رقم كتابهم: ${doc.ref_number}`);
      if (doc.doc_date) contextLines.push(`تاريخ كتابهم: ${doc.doc_date}`);
      if (doc.subject ?? doc.title) contextLines.push(`موضوع كتابهم: ${doc.subject ?? doc.title}`);
      if (doc.action_required) contextLines.push(`المطلوب في كتابهم: ${doc.action_required}`);
      if (doc.summary) contextLines.push(`ملخص كتابهم: ${doc.summary}`);
    }
  }

  const user = [
    contextLines.length ? `السياق:\n${contextLines.join('\n')}` : null,
    `التعليمات:\n${instructions}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  let html = await chatCall({
    apiKey: c.env.OPENROUTER_API_KEY,
    model: c.env.MODEL_CHAT,
    system: LETTER_SYSTEM,
    messages: [{ role: 'user', content: user }],
    maxTokens: 3500,
  });
  html = html
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  return c.json({ html });
});

export default letters;
