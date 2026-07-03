'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { apiPost } from '@/lib/api';

interface Source {
  n: number;
  document_id: string;
  title: string;
  page: number;
  snippet: string;
  score: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

const ARABIC_RE = /[\u0600-\u06FF]/;

const EXAMPLES = [
  'شو قيمة كفالة حسن التنفيذ ومتى تنتهي؟',
  'What does the contract say about liquidated damages?',
];

function ChatView() {
  const projectId = useSearchParams().get('id') ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setBusy(true);
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: message }]);
    try {
      const res = await apiPost<{ answer: string; sources: Source[] }>(
        `/projects/${projectId}/chat`,
        { message, history }
      );
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: res.answer, sources: res.sources },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'حدث خطأ أثناء الاتصال بالخادم — حاول مرة أخرى.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-line pb-4">
        <h1 className="text-xl font-bold">اسأل الوثائق</h1>
        <Link href={`/project?id=${projectId}`} className="text-sm text-muted hover:text-ink">
          ← العودة إلى المشروع
        </Link>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {messages.length === 0 && (
          <div className="rounded-lg border border-line bg-card p-6 text-center">
            <div className="font-semibold">اسأل أي سؤال عن وثائق هذا المشروع</div>
            <div className="mt-1 text-sm text-muted">
              كل إجابة تأتي مع مصادرها: «الوثيقة — صفحة N».
            </div>
            <div className="mt-4 flex flex-col items-center gap-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  dir="auto"
                  onClick={() => void send(q)}
                  className="rounded-full border border-line bg-paper px-4 py-1.5 text-sm hover:border-amber"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const dir = ARABIC_RE.test(m.content) ? 'rtl' : 'ltr';
          return (
            <div key={i} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
              <div
                dir={dir}
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  isUser ? 'bg-ink text-card' : 'border border-line bg-card'
                }`}
              >
                {m.content}
                {!isUser && m.sources && m.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2" dir="rtl">
                    {m.sources.map((s) => (
                      <span
                        key={s.n}
                        title={s.snippet}
                        className="rounded-full bg-amber-soft px-2 py-0.5 text-xs text-amber"
                        dir="auto"
                      >
                        [{s.n}] {s.title} ص {s.page}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {busy && <div className="text-sm text-muted">جارِ البحث في الوثائق…</div>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2 border-t border-line pt-4"
      >
        <input
          dir="auto"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب سؤالك…"
          className="flex-1 rounded-md border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-amber"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-card disabled:opacity-40"
        >
          إرسال
        </button>
      </form>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">جارِ التحميل…</div>}>
      <ChatView />
    </Suspense>
  );
}
