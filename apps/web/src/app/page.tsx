'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, fmtDate, fmtMoney, fmtNumber, GTYPE_AR } from '@/lib/api';

interface BriefLetter {
  id: string;
  project_id: string;
  project_name: string;
  sender: string | null;
  ref_number: string | null;
  subject: string | null;
  reply_deadline: string | null;
  days_left: number | null;
}

interface BriefGuarantee {
  id: string;
  project_id: string;
  project_name: string;
  gtype: string | null;
  bank: string | null;
  amount: number | null;
  currency: string | null;
  expiry_date: string | null;
  days_left: number | null;
}

interface BriefIpc {
  id: string;
  project_id: string;
  project_name: string;
  ipc_number: string | null;
  status: string;
  amount_certified: number | null;
  amount_paid: number | null;
}

interface Brief {
  generated_at: string;
  letters: BriefLetter[];
  guarantees: BriefGuarantee[];
  ipcs: BriefIpc[];
}

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  contract_value: number | null;
  currency: string | null;
  doc_count: number;
  open_letters: number;
}

function Countdown({ days }: { days: number | null }) {
  let box = 'border border-line bg-card text-ink';
  let label = 'يوم';
  let value: string;
  if (days == null) {
    value = '؟';
    label = 'بلا موعد';
    box = 'border border-line bg-card text-muted';
  } else if (days < 0) {
    value = String(Math.abs(days));
    label = 'متأخر';
    box = 'bg-brick-soft text-brick';
  } else if (days <= 3) {
    value = String(days);
    box = 'bg-brick-soft text-brick';
  } else if (days <= 7) {
    value = String(days);
    box = 'bg-amber-soft text-amber';
  } else {
    value = String(days);
  }
  return (
    <div className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-lg py-2 ${box}`}>
      <span className="ltr-data text-2xl font-bold leading-none">{value}</span>
      <span className="mt-1 text-xs">{label}</span>
    </div>
  );
}

export default function HomePage() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([
        apiGet<Brief>('/brief'),
        apiGet<{ projects: Project[] }>('/projects'),
      ]);
      setBrief(b);
      setProjects(p.projects);
      setError(null);
    } catch {
      setError('تعذّر الاتصال بالخادم — تأكد أن واجهة البرمجة تعمل ثم أعد تحميل الصفحة.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await apiPost('/projects', {
        name: name.trim(),
        client_name: clientName.trim() || undefined,
      });
      setName('');
      setClientName('');
      await load();
    } catch {
      setError('تعذّر إنشاء المشروع — حاول مرة أخرى.');
    } finally {
      setCreating(false);
    }
  }

  const briefEmpty =
    brief && brief.letters.length === 0 && brief.guarantees.length === 0 && brief.ipcs.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {error && (
        <div className="rounded-lg bg-brick-soft px-4 py-3 text-sm text-brick">{error}</div>
      )}

      <section>
        <h1 className="text-2xl font-bold">الموجز الصباحي</h1>
        <p className="mt-1 text-sm text-muted">
          ما يحتاج انتباهك اليوم: كتب بانتظار الرد، كفالات تقترب من الانتهاء، مستخلصات غير مدفوعة.
        </p>

        <div className="mt-5 space-y-3">
          {!brief && !error && <div className="text-sm text-muted">جارِ التحميل…</div>}
          {briefEmpty && (
            <div className="rounded-lg border border-line bg-card px-4 py-6 text-center text-sm text-muted">
              لا توجد بنود عاجلة اليوم. ارفع وثائق مشاريعك وستظهر المواعيد هنا تلقائياً.
            </div>
          )}

          {brief?.letters.map((l) => (
            <Link
              key={l.id}
              href={`/project?id=${l.project_id}`}
              className="flex items-center gap-4 rounded-lg border border-line bg-card p-4 hover:border-amber"
            >
              <Countdown days={l.days_left} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold" dir="auto">
                  كتاب يتطلب رداً — {l.subject ?? 'بدون موضوع'}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span dir="auto">{l.project_name}</span>
                  {l.sender && <span dir="auto">من: {l.sender}</span>}
                  {l.ref_number && <span className="ltr-data text-xs">{l.ref_number}</span>}
                  {l.reply_deadline && <span>الموعد: {fmtDate(l.reply_deadline)}</span>}
                </div>
              </div>
            </Link>
          ))}

          {brief?.guarantees.map((g) => (
            <Link
              key={g.id}
              href={`/project?id=${g.project_id}`}
              className="flex items-center gap-4 rounded-lg border border-line bg-card p-4 hover:border-amber"
            >
              <Countdown days={g.days_left} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold" dir="auto">
                  كفالة {GTYPE_AR[g.gtype ?? 'other']} تقترب من الانتهاء
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span dir="auto">{g.project_name}</span>
                  {g.bank && <span dir="auto">{g.bank}</span>}
                  {g.amount != null && (
                    <span className="ltr-data text-xs">{fmtMoney(g.amount, g.currency ?? 'JOD')}</span>
                  )}
                  {g.expiry_date && <span>تنتهي: {fmtDate(g.expiry_date)}</span>}
                </div>
              </div>
            </Link>
          ))}

          {brief?.ipcs.map((i) => (
            <Link
              key={i.id}
              href={`/project?id=${i.project_id}`}
              className="flex items-center gap-4 rounded-lg border border-line bg-card p-4 hover:border-ledger"
            >
              <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-ledger-soft py-2 text-ledger">
                <span className="text-xs">مستخلص</span>
                <span className="ltr-data mt-1 text-lg font-bold leading-none">
                  {i.ipc_number ?? '؟'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {i.status === 'certified' ? 'مستخلص معتمد غير مدفوع' : 'قيد الاعتماد'}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span dir="auto">{i.project_name}</span>
                  {i.amount_certified != null && (
                    <span>
                      المعتمد: <span className="ltr-data text-xs">{fmtNumber(i.amount_certified)}</span>
                    </span>
                  )}
                  {i.amount_paid != null && (
                    <span>
                      المدفوع: <span className="ltr-data text-xs">{fmtNumber(i.amount_paid)}</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">المشاريع</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {projects?.map((p) => (
            <Link
              key={p.id}
              href={`/project?id=${p.id}`}
              className="rounded-lg border border-line bg-card p-5 hover:border-amber"
            >
              <div className="font-bold" dir="auto">
                {p.name}
              </div>
              {p.client_name && (
                <div className="mt-1 text-sm text-muted" dir="auto">
                  {p.client_name}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-muted">{fmtNumber(p.doc_count)} وثيقة</span>
                {p.open_letters > 0 && (
                  <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs text-amber">
                    {fmtNumber(p.open_letters)} كتاب بانتظار الرد
                  </span>
                )}
                {p.contract_value != null && (
                  <span className="ltr-data text-xs text-muted">
                    {fmtMoney(p.contract_value, p.currency ?? 'JOD')}
                  </span>
                )}
              </div>
            </Link>
          ))}

          <form
            onSubmit={createProject}
            className="flex flex-col justify-center gap-3 rounded-lg border border-dashed border-line bg-card p-5"
          >
            <div className="text-sm font-semibold">مشروع جديد</div>
            <input
              dir="auto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم المشروع *"
              className="rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-amber"
            />
            <input
              dir="auto"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="صاحب العمل (اختياري)"
              className="rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-amber"
            />
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-card disabled:opacity-40"
            >
              {creating ? 'جارِ الإنشاء…' : 'إنشاء المشروع'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
