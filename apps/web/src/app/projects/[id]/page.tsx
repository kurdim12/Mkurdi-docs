'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  apiGet,
  apiUpload,
  DOC_TYPE_AR,
  fmtDate,
  fmtMoney,
  fmtNumber,
  GTYPE_AR,
  STATUS_AR,
} from '@/lib/api';

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  contract_value: number | null;
  currency: string | null;
}

interface Doc {
  id: string;
  filename: string;
  doc_type: string;
  status: string;
  error: string | null;
  page_count: number | null;
  language: string | null;
  title: string | null;
  ref_number: string | null;
  doc_date: string | null;
  summary: string | null;
}

interface Guarantee {
  id: string;
  gtype: string | null;
  bank: string | null;
  amount: number | null;
  currency: string | null;
  expiry_date: string | null;
}

interface Ipc {
  id: string;
  ipc_number: string | null;
  amount_claimed: number | null;
  amount_certified: number | null;
  amount_paid: number | null;
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === 'processing'
      ? 'bg-amber-soft text-amber animate-pulse'
      : status === 'ready'
        ? 'bg-ledger-soft text-ledger'
        : 'bg-brick-soft text-brick';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {STATUS_AR[status] ?? status}
    </span>
  );
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [guarantees, setGuarantees] = useState<Guarantee[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadProject = useCallback(async () => {
    try {
      const data = await apiGet<{
        project: Project;
        guarantees: Guarantee[];
        ipcs: Ipc[];
      }>(`/projects/${projectId}`);
      setProject(data.project);
      setGuarantees(data.guarantees);
      setIpcs(data.ipcs);
    } catch {
      setError('تعذّر تحميل المشروع.');
    }
  }, [projectId]);

  const loadDocs = useCallback(async () => {
    try {
      const data = await apiGet<{ documents: Doc[] }>(`/projects/${projectId}/documents`);
      setDocs(data.documents);
      return data.documents;
    } catch {
      setError('تعذّر تحميل الوثائق.');
      return [];
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
    void loadDocs();
  }, [loadProject, loadDocs]);

  // Poll every 5s while any document is still processing.
  useEffect(() => {
    if (!docs?.some((d) => d.status === 'processing')) return;
    const t = setInterval(() => {
      void loadDocs().then((updated) => {
        if (!updated.some((d) => d.status === 'processing')) void loadProject();
      });
    }, 5000);
    return () => clearInterval(t);
  }, [docs, loadDocs, loadProject]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await apiUpload(`/projects/${projectId}/documents`, form);
      }
    } catch {
      setError('فشل رفع أحد الملفات — تأكد أنه PDF ثم حاول مجدداً.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
      void loadDocs();
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" dir="auto">
            {project?.name ?? '…'}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {project?.client_name && <span dir="auto">{project.client_name}</span>}
            {project?.contract_value != null && (
              <span className="ltr-data text-xs">
                {fmtMoney(project.contract_value, project.currency ?? 'JOD')}
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/projects/${projectId}/chat`}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-card"
        >
          اسأل الوثائق
        </Link>
      </header>

      {error && (
        <div className="rounded-lg bg-brick-soft px-4 py-3 text-sm text-brick">{error}</div>
      )}

      <label className="block cursor-pointer rounded-lg border-2 border-dashed border-line bg-card p-8 text-center hover:border-amber">
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
        <div className="font-semibold">{uploading ? 'جارِ الرفع…' : 'ارفع وثائق PDF'}</div>
        <div className="mt-1 text-sm text-muted">
          عقود، كتب رسمية، كفالات، مستخلصات — عربية أو إنجليزية، ممسوحة أو رقمية.
        </div>
      </label>

      <section>
        <h2 className="text-lg font-bold">الوثائق</h2>
        <div className="mt-3 space-y-3">
          {docs == null && <div className="text-sm text-muted">جارِ التحميل…</div>}
          {docs?.length === 0 && (
            <div className="rounded-lg border border-line bg-card px-4 py-6 text-center text-sm text-muted">
              لا توجد وثائق بعد.
            </div>
          )}
          {docs?.map((d) => (
            <div key={d.id} className="rounded-lg border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                  {DOC_TYPE_AR[d.doc_type] ?? d.doc_type}
                </span>
                <span className="font-semibold" dir="auto">
                  {d.title ?? d.filename}
                </span>
                <StatusChip status={d.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                {d.ref_number && <span className="ltr-data text-xs">{d.ref_number}</span>}
                {d.doc_date && <span>{fmtDate(d.doc_date)}</span>}
                {d.page_count != null && (
                  <span>
                    <span className="ltr-data text-xs">{d.page_count}</span> ص
                  </span>
                )}
              </div>
              {d.summary && (
                <p className="mt-2 text-sm text-muted" dir="auto">
                  {d.summary}
                </p>
              )}
              {d.status === 'failed' && d.error && (
                <p className="mt-2 text-sm text-brick" dir="auto">
                  {d.error}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-card p-4">
          <h3 className="font-bold text-ledger">الكفالات</h3>
          <div className="mt-3 space-y-2 text-sm">
            {guarantees.length === 0 && <div className="text-muted">لا توجد كفالات مسجّلة.</div>}
            {guarantees.map((g) => (
              <div key={g.id} className="rounded-md bg-ledger-soft px-3 py-2">
                <div className="font-semibold">
                  {GTYPE_AR[g.gtype ?? 'other']}
                  {g.bank && (
                    <span className="font-normal text-muted" dir="auto">
                      {' '}
                      — {g.bank}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                  {g.amount != null && (
                    <span className="ltr-data">{fmtMoney(g.amount, g.currency ?? 'JOD')}</span>
                  )}
                  {g.expiry_date && <span>تنتهي {fmtDate(g.expiry_date)}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-card p-4">
          <h3 className="font-bold text-ledger">المستخلصات</h3>
          <div className="mt-3 space-y-2 text-sm">
            {ipcs.length === 0 && <div className="text-muted">لا توجد مستخلصات مسجّلة.</div>}
            {ipcs.map((i) => (
              <div key={i.id} className="rounded-md bg-ledger-soft px-3 py-2">
                <div className="font-semibold">
                  مستخلص <span className="ltr-data text-xs">{i.ipc_number ?? '؟'}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>
                    مُطالب: <span className="ltr-data">{fmtNumber(i.amount_claimed)}</span>
                  </span>
                  <span>
                    معتمد: <span className="ltr-data">{fmtNumber(i.amount_certified)}</span>
                  </span>
                  <span>
                    مدفوع: <span className="ltr-data">{fmtNumber(i.amount_paid)}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
