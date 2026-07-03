const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

function baseHeaders(): Record<string, string> {
  return API_KEY ? { 'x-api-key': API_KEY } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw new Error(`API ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: baseHeaders(), cache: 'no-store' });
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { ...baseHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: baseHeaders(),
    body: form,
  });
  return handle<T>(res);
}

export const DOC_TYPE_AR: Record<string, string> = {
  contract: 'عقد',
  boq: 'جدول كميات',
  letter_in: 'كتاب وارد',
  letter_out: 'كتاب صادر',
  guarantee: 'كفالة',
  ipc: 'مستخلص',
  drawing: 'مخطط',
  other: 'أخرى',
};

export const GTYPE_AR: Record<string, string> = {
  bid: 'دخول عطاء',
  performance: 'حسن تنفيذ',
  advance: 'دفعة مقدمة',
  retention: 'صيانة / محتجزات',
  other: 'أخرى',
};

export const STATUS_AR: Record<string, string> = {
  processing: 'قيد المعالجة',
  ready: 'جاهز',
  failed: 'فشل',
};

const numberFmt = new Intl.NumberFormat('ar-JO');
const dateFmt = new Intl.DateTimeFormat('ar-JO', { dateStyle: 'medium' });

export function fmtNumber(n: number | null | undefined): string {
  return n == null ? '—' : numberFmt.format(n);
}

export function fmtMoney(n: number | null | undefined, currency = 'JOD'): string {
  if (n == null) return '—';
  try {
    return new Intl.NumberFormat('ar-JO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${numberFmt.format(n)} ${currency}`;
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}
