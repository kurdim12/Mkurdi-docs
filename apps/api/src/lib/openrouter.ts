const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

async function callOpenRouter(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as OpenRouterResponse;
  return json.choices?.[0]?.message?.content ?? '';
}

/**
 * Parse a PDF via the OpenRouter file plugin with engine "native" — the model
 * sees the raw PDF. Never swap in free text-extraction engines: they destroy Arabic.
 * `fileData` is either an https URL or a data:application/pdf;base64,... URL.
 */
export async function parsePdf(opts: {
  apiKey: string;
  model: string;
  filename: string;
  fileData: string;
  prompt: string;
}): Promise<string> {
  return callOpenRouter(opts.apiKey, {
    model: opts.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: opts.prompt },
          { type: 'file', file: { filename: opts.filename, file_data: opts.fileData } },
        ],
      },
    ],
    plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
    temperature: 0,
    max_tokens: 60000,
  });
}

/** Structured JSON call with defensive parsing. */
export async function jsonCall<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<T> {
  const raw = await callOpenRouter(opts.apiKey, {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
    max_tokens: 4000,
  });
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error(`jsonCall: model did not return JSON: ${stripped.slice(0, 200)}`);
  }
}

export async function chatCall(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<string> {
  return callOpenRouter(opts.apiKey, {
    model: opts.model,
    messages: [{ role: 'system', content: opts.system }, ...opts.messages],
    temperature: 0.2,
    max_tokens: opts.maxTokens ?? 2500,
  });
}
