export type DocType =
  | 'contract'
  | 'boq'
  | 'letter_in'
  | 'letter_out'
  | 'guarantee'
  | 'ipc'
  | 'drawing'
  | 'other';

export interface Env {
  DB: D1Database;
  DOCS: R2Bucket;
  VEC: VectorizeIndex;
  AI: Ai;
  INGEST: Workflow;
  MODEL_EXTRACT: string;
  MODEL_CHAT: string;
  PARSE_MODE: string; // "base64" | "url"
  PUBLIC_API_URL: string;
  OPENROUTER_API_KEY: string;
  SIGNING_SECRET: string;
  API_KEY?: string;
}

export interface IngestParams {
  documentId: string;
  projectId: string;
  r2Key: string;
  filename: string;
}

export interface LetterExtraction {
  direction?: 'in' | 'out' | null;
  sender?: string | null;
  recipient?: string | null;
  subject?: string | null;
  requires_reply?: boolean | null;
  reply_deadline?: string | null;
  action_required?: string | null;
}

export interface GuaranteeExtraction {
  gtype?: 'bid' | 'performance' | 'advance' | 'retention' | 'other' | null;
  bank?: string | null;
  amount?: number | null;
  currency?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
}

export interface IpcExtraction {
  ipc_number?: string | null;
  period?: string | null;
  amount_claimed?: number | null;
  amount_certified?: number | null;
  amount_paid?: number | null;
  retention_held?: number | null;
  status?: 'submitted' | 'certified' | 'paid' | null;
}

export interface Classification {
  doc_type?: DocType | null;
  title?: string | null;
  language?: 'ar' | 'en' | 'mixed' | null;
  ref_number?: string | null;
  doc_date?: string | null;
  summary?: string | null;
  letter?: LetterExtraction | null;
  guarantee?: GuaranteeExtraction | null;
  ipc?: IpcExtraction | null;
}
