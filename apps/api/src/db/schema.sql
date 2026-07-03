-- MKurdi Operations — D1 schema
-- Seven tables. TEXT UUIDs. Idempotent (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  client_name    TEXT,
  contract_value REAL,
  currency       TEXT DEFAULT 'JOD',
  start_date     TEXT,
  status         TEXT DEFAULT 'active',
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  r2_key     TEXT NOT NULL,
  filename   TEXT NOT NULL,
  doc_type   TEXT DEFAULT 'other',     -- contract|boq|letter_in|letter_out|guarantee|ipc|drawing|other
  status     TEXT DEFAULT 'processing', -- processing|ready|failed
  error      TEXT,
  page_count INTEGER,
  language   TEXT,                      -- ar|en|mixed
  title      TEXT,
  ref_number TEXT,
  doc_date   TEXT,
  summary    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,          -- `${documentId}:${i}`
  document_id TEXT NOT NULL REFERENCES documents(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  page        INTEGER NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project_id);

-- Ledger 1 — المراسلات
CREATE TABLE IF NOT EXISTS letters (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES documents(id),
  project_id      TEXT NOT NULL REFERENCES projects(id),
  direction       TEXT DEFAULT 'in',    -- in|out
  sender          TEXT,
  recipient       TEXT,
  ref_number      TEXT,
  subject         TEXT,
  letter_date     TEXT,
  requires_reply  INTEGER DEFAULT 0,
  reply_deadline  TEXT,
  action_required TEXT,
  status          TEXT DEFAULT 'open',  -- open|replied|closed
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_letters_project ON letters(project_id);
CREATE INDEX IF NOT EXISTS idx_letters_deadline ON letters(reply_deadline);

-- Ledger 2 — الكفالات
CREATE TABLE IF NOT EXISTS guarantees (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  gtype       TEXT,                     -- bid|performance|advance|retention|other
  bank        TEXT,
  amount      REAL,
  currency    TEXT DEFAULT 'JOD',
  issue_date  TEXT,
  expiry_date TEXT,
  status      TEXT DEFAULT 'active',    -- active|released|expired
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_guarantees_project ON guarantees(project_id);
CREATE INDEX IF NOT EXISTS idx_guarantees_expiry ON guarantees(expiry_date);

-- Ledger 3 — المستخلصات
CREATE TABLE IF NOT EXISTS ipcs (
  id               TEXT PRIMARY KEY,
  document_id      TEXT NOT NULL REFERENCES documents(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  ipc_number       TEXT,
  period           TEXT,
  amount_claimed   REAL,
  amount_certified REAL,
  amount_paid      REAL,
  retention_held   REAL,
  status           TEXT DEFAULT 'submitted', -- submitted|certified|paid
  created_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ipcs_project ON ipcs(project_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  role         TEXT,                    -- user|assistant
  content      TEXT NOT NULL,
  sources_json TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id);
