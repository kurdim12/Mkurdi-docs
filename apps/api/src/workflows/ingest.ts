import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import type { Classification, Env, IngestParams } from '../types';
import { chunkPages, extractPages } from '../lib/chunker';
import { embedChunks } from '../lib/embeddings';
import { jsonCall, parsePdf } from '../lib/openrouter';
import { CLASSIFY_PROMPT, PARSE_PROMPT } from '../lib/prompts';
import { arrayBufferToBase64, signedFileUrl } from '../lib/sign';

const BATCH = 20;

/**
 * Durable ingestion pipeline. Steps return only small serializable values —
 * the intermediate markdown lives in R2 at parsed/{documentId}.md, never in
 * step outputs (Workflows persists step results).
 */
export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
    const { documentId, projectId, r2Key, filename } = event.payload;
    const parsedKey = `parsed/${documentId}.md`;

    const readParsed = async (): Promise<string> => {
      const obj = await this.env.DOCS.get(parsedKey);
      if (!obj) throw new Error(`Parsed markdown missing from R2: ${parsedKey}`);
      return obj.text();
    };

    try {
      await step.do('parse-pdf', async () => {
        let fileData: string;
        if (this.env.PARSE_MODE === 'url') {
          fileData = await signedFileUrl(
            this.env.PUBLIC_API_URL,
            this.env.SIGNING_SECRET,
            documentId
          );
        } else {
          const obj = await this.env.DOCS.get(r2Key);
          if (!obj) throw new Error(`PDF missing from R2: ${r2Key}`);
          fileData = `data:application/pdf;base64,${arrayBufferToBase64(await obj.arrayBuffer())}`;
        }
        const md = await parsePdf({
          apiKey: this.env.OPENROUTER_API_KEY,
          model: this.env.MODEL_EXTRACT,
          filename,
          fileData,
          prompt: PARSE_PROMPT,
        });
        await this.env.DOCS.put(parsedKey, md, {
          httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
        });
        return extractPages(md).length;
      });

      await step.do('classify-extract', async () => {
        const md = await readParsed();
        const c = await jsonCall<Classification>({
          apiKey: this.env.OPENROUTER_API_KEY,
          model: this.env.MODEL_EXTRACT,
          system: CLASSIFY_PROMPT,
          user: md.slice(0, 9000),
        });
        const docType = c.doc_type ?? 'other';
        await this.env.DB.prepare(
          `UPDATE documents
             SET doc_type = ?, title = ?, language = ?, ref_number = ?, doc_date = ?, summary = ?, page_count = ?
           WHERE id = ?`
        )
          .bind(
            docType,
            c.title ?? null,
            c.language ?? null,
            c.ref_number ?? null,
            c.doc_date ?? null,
            c.summary ?? null,
            extractPages(md).length,
            documentId
          )
          .run();

        if ((docType === 'letter_in' || docType === 'letter_out') && c.letter) {
          const direction =
            c.letter.direction ?? (docType === 'letter_in' ? 'in' : 'out');
          await this.env.DB.prepare(
            `INSERT INTO letters (id, document_id, project_id, direction, sender, recipient, ref_number, subject, letter_date, requires_reply, reply_deadline, action_required)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              crypto.randomUUID(),
              documentId,
              projectId,
              direction,
              c.letter.sender ?? null,
              c.letter.recipient ?? null,
              c.ref_number ?? null,
              c.letter.subject ?? null,
              c.doc_date ?? null,
              c.letter.requires_reply ? 1 : 0,
              c.letter.reply_deadline ?? null,
              c.letter.action_required ?? null
            )
            .run();
        } else if (docType === 'guarantee' && c.guarantee) {
          await this.env.DB.prepare(
            `INSERT INTO guarantees (id, document_id, project_id, gtype, bank, amount, currency, issue_date, expiry_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              crypto.randomUUID(),
              documentId,
              projectId,
              c.guarantee.gtype ?? 'other',
              c.guarantee.bank ?? null,
              c.guarantee.amount ?? null,
              c.guarantee.currency ?? 'JOD',
              c.guarantee.issue_date ?? null,
              c.guarantee.expiry_date ?? null
            )
            .run();
        } else if (docType === 'ipc' && c.ipc) {
          await this.env.DB.prepare(
            `INSERT INTO ipcs (id, document_id, project_id, ipc_number, period, amount_claimed, amount_certified, amount_paid, retention_held, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              crypto.randomUUID(),
              documentId,
              projectId,
              c.ipc.ipc_number ?? null,
              c.ipc.period ?? null,
              c.ipc.amount_claimed ?? null,
              c.ipc.amount_certified ?? null,
              c.ipc.amount_paid ?? null,
              c.ipc.retention_held ?? null,
              c.ipc.status ?? 'submitted'
            )
            .run();
        }
        return docType;
      });

      await step.do('chunk-store', async () => {
        const md = await readParsed();
        const chunks = chunkPages(extractPages(md));
        for (let i = 0; i < chunks.length; i += BATCH) {
          const batch = chunks.slice(i, i + BATCH);
          await this.env.DB.batch(
            batch.map((chunk, j) =>
              this.env.DB.prepare(
                `INSERT OR REPLACE INTO chunks (id, document_id, project_id, page, content)
                 VALUES (?, ?, ?, ?, ?)`
              ).bind(`${documentId}:${i + j}`, documentId, projectId, chunk.page, chunk.content)
            )
          );
        }
        return chunks.length;
      });

      await step.do('embed-upsert', async () => {
        const { results } = await this.env.DB.prepare(
          `SELECT id, page, content FROM chunks WHERE document_id = ? ORDER BY id`
        )
          .bind(documentId)
          .all<{ id: string; page: number; content: string }>();
        for (let i = 0; i < results.length; i += BATCH) {
          const batch = results.slice(i, i + BATCH);
          const vectors = await embedChunks(
            this.env,
            batch.map((r) => r.content)
          );
          await this.env.VEC.upsert(
            batch.map((r, j) => ({
              id: r.id,
              values: vectors[j]!,
              metadata: { project_id: projectId, document_id: documentId, page: r.page },
            }))
          );
        }
        return results.length;
      });

      await step.do('mark-ready', async () => {
        await this.env.DB.prepare(
          `UPDATE documents SET status = 'ready', error = NULL WHERE id = ?`
        )
          .bind(documentId)
          .run();
        return 'ready';
      });

      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await step.do('mark-failed', async () => {
        await this.env.DB.prepare(
          `UPDATE documents SET status = 'failed', error = ? WHERE id = ?`
        )
          .bind(message.slice(0, 900), documentId)
          .run();
        return 'failed';
      });
      return { ok: false, error: message.slice(0, 900) };
    }
  }
}
