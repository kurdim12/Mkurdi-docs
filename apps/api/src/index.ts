import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import projects from './routes/projects';
import documents from './routes/documents';
import files from './routes/files';
import chat from './routes/chat';
import brief from './routes/brief';
import letters from './routes/letters';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Optional single-tenant gate: if API_KEY is set, every route except the
// HMAC-signed /files/* (fetched by OpenRouter) requires x-api-key.
app.use('*', async (c, next) => {
  if (c.env.API_KEY && !c.req.path.startsWith('/files/')) {
    if (c.req.header('x-api-key') !== c.env.API_KEY) {
      return c.json({ error: 'unauthorized' }, 401);
    }
  }
  await next();
});

app.get('/', (c) => c.json({ name: 'MKurdi Operations API', ok: true }));

app.route('/projects', projects);
app.route('/', documents);
app.route('/', files);
app.route('/', chat);
app.route('/', brief);
app.route('/', letters);

export default app;
export { IngestWorkflow } from './workflows/ingest';
