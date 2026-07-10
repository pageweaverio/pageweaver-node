import type { HttpClient } from "./http";
import { PageWeaverDocumentFailedError, PageWeaverTimeoutError } from "./errors";
import type {
  CommentMigrationRollup,
  CreateDocumentParams,
  CreateDocumentResult,
  CreateSyncResult,
  Document,
  DocumentPage,
  DocumentPageInfo,
  DocumentStatus,
  DocumentVerification,
  ProvenanceReceipt,
  ListDocumentsParams,
  MigrateCommentsParams,
  MigrateCommentsResult,
  ValidateDocumentParams,
  ValidateDocumentResult,
} from "./types";

/** Statuses at which a document stops changing. */
const TERMINAL: ReadonlySet<string> = new Set(["done", "failed"]);

export interface WaitOptions {
  /** Initial delay between polls, ms. Default 1000. */
  intervalMs?: number;
  /** Cap the (backing-off) poll delay, ms. Default 5000. */
  maxIntervalMs?: number;
  /** Multiplier applied to the delay after each poll. Default 1.5. */
  backoff?: number;
  /** Give up after this long, ms. Default 60000. */
  timeoutMs?: number;
  /** Throw {@link PageWeaverDocumentFailedError} if the document fails. Default true. */
  throwOnFailure?: boolean;
  /** Abort waiting early. */
  signal?: AbortSignal;
}

export interface DownloadOptions {
  /** The download password, for a download-protected document. */
  password?: string;
  signal?: AbortSignal;
}

export interface CreateSyncOptions {
  /**
   * Stream raw PDF bytes for an unprotected document (`Accept: application/pdf`). Default **false**:
   * receive the finished document as JSON with a signed `download.url`. Set true to get the bytes
   * directly (e.g. to write a file). Protected/failed documents always come back as JSON regardless.
   */
  pdf?: boolean;
  signal?: AbortSignal;
}

/** Operations on documents: the core of the API. */
export class DocumentsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a document from a template (with a validated payload) or from inline HTML. Returns
   * `202` immediately with the document id and status "queued". Poll {@link get}, call
   * {@link waitFor}, or use {@link createAndWait} to block until it is ready.
   */
  create(params: CreateDocumentParams, signal?: AbortSignal): Promise<CreateDocumentResult> {
    const { idempotencyKey, ...rest } = params;
    const headers = idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined;
    return this.http.json<CreateDocumentResult>("POST", "/v1/documents", {
      body: rest,
      headers,
      signal,
    });
  }

  /**
   * Dry-run a payload against a template's JSON Schema and get pass or fail with error detail, for
   * free: nothing is rendered, no page is counted, and no usage is recorded. Use it to pre-flight (and
   * repair) data before spending a render. Resolves with `{ ok, errors, version, schemaId,
   * schemaVersion }`; when `ok` is false, fix the fields named in `errors` and try again. The `version`
   * it echoes is the one a matching {@link create} pins, so validating then issuing use the same contract.
   */
  validate(
    params: ValidateDocumentParams,
    signal?: AbortSignal,
  ): Promise<ValidateDocumentResult> {
    return this.http.json<ValidateDocumentResult>("POST", "/v1/documents/validate", {
      body: params,
      signal,
    });
  }

  /** Fetch the current state of a document. When `status` is "done" it carries a `download` block. */
  get(id: string, signal?: AbortSignal): Promise<Document> {
    return this.http.json<Document>("GET", `/v1/documents/${encodeURIComponent(id)}`, { signal });
  }

  /**
   * Fetch a document's integrity proof: the SHA-256 `contentHash`, its hash-chain position, and
   * `chainVerified`. To check a file you already hold, re-hash its bytes and compare to `contentHash`
   * yourself — no API call is required for that.
   */
  verify(id: string, signal?: AbortSignal): Promise<DocumentVerification> {
    return this.http.json<DocumentVerification>(
      "GET",
      `/v1/documents/${encodeURIComponent(id)}/verify`,
      { signal },
    );
  }

  /**
   * Export a signed provenance receipt for a completed document: an HMAC-signed bundle binding the file
   * to the request that produced it (`requestHash`), the pinned template version (`artifactHash`), the
   * triggering identity, the issue time, and the content hash + chain link. Verify it offline against
   * the published key. Requires a plan with the provenance-receipt capability.
   */
  receipt(id: string, signal?: AbortSignal): Promise<ProvenanceReceipt> {
    return this.http.json<ProvenanceReceipt>(
      "GET",
      `/v1/documents/${encodeURIComponent(id)}/receipt`,
      { signal },
    );
  }

  /**
   * Export an offline proof pack for a completed document: the raw bytes of a self-contained ZIP that
   * bundles the exact PDF, a `manifest.json` of its integrity fingerprints, the frozen template that
   * produced it, the request that was sent, and a static `verify.html` a recipient opens to re-hash and
   * check everything client-side, with no account and no network. Write the bytes to a `.zip` file.
   * Requires a plan with the proof-pack capability; a completed, not-yet-purged document only.
   */
  proofPack(id: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.http.bytes("GET", `/v1/documents/${encodeURIComponent(id)}/proof`, {
      headers: { accept: "application/zip" },
      signal,
    });
  }

  /** One page of the document history, newest first. Use `nextCursor` to page. */
  list(params: ListDocumentsParams = {}, signal?: AbortSignal): Promise<DocumentPage> {
    return this.http.json<DocumentPage>("GET", "/v1/documents", {
      query: {
        status: params.status,
        templateId: params.templateId,
        cursor: params.cursor,
        limit: params.limit,
      },
      signal,
    });
  }

  /**
   * Iterate every document across all pages, transparently following the cursor.
   *
   * ```ts
   * for await (const doc of pw.documents.listAll({ status: "failed" })) { ... }
   * ```
   */
  async *listAll(
    params: Omit<ListDocumentsParams, "cursor"> = {},
    signal?: AbortSignal,
  ): AsyncGenerator<DocumentPage["items"][number]> {
    let cursor: string | null | undefined;
    do {
      const page = await this.list({ ...params, cursor: cursor ?? undefined }, signal);
      for (const item of page.items) yield item;
      cursor = page.nextCursor;
    } while (cursor);
  }

  /**
   * Faithfully replay a prior document: the same version (or inline source), payload, options, and
   * download protection. Returns a new document id (`202`); counts as a new render.
   */
  regenerate(id: string, signal?: AbortSignal): Promise<CreateDocumentResult> {
    return this.http.json<CreateDocumentResult>(
      "POST",
      `/v1/documents/${encodeURIComponent(id)}/regenerate`,
      { signal },
    );
  }

  /**
   * Poll a document until it reaches a terminal state (or the timeout elapses). Resolves with the
   * finished {@link Document}. By default it throws {@link PageWeaverDocumentFailedError} on failure;
   * pass `throwOnFailure: false` to receive the failed document instead.
   */
  async waitFor(id: string, opts: WaitOptions = {}): Promise<Document> {
    const intervalMs = opts.intervalMs ?? 1000;
    const maxIntervalMs = opts.maxIntervalMs ?? 5000;
    const backoff = opts.backoff ?? 1.5;
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const throwOnFailure = opts.throwOnFailure ?? true;
    const deadline = Date.now() + timeoutMs;

    let delay = intervalMs;
    let last: Document = await this.get(id, opts.signal);
    while (!TERMINAL.has(last.status)) {
      if (Date.now() >= deadline) {
        throw new PageWeaverTimeoutError(id, last.status, timeoutMs);
      }
      const remaining = deadline - Date.now();
      await sleep(Math.min(delay, remaining), opts.signal);
      delay = Math.min(delay * backoff, maxIntervalMs);
      last = await this.get(id, opts.signal);
    }
    if (last.status === "failed" && throwOnFailure) {
      throw new PageWeaverDocumentFailedError(last);
    }
    return last;
  }

  /** Convenience: {@link create} then {@link waitFor}. Resolves with the finished document. */
  async createAndWait(params: CreateDocumentParams, opts: WaitOptions = {}): Promise<Document> {
    const created = await this.create(params, opts.signal);
    return this.waitFor(created.id, opts);
  }

  /**
   * Create a document synchronously: send `Prefer: wait` so the server holds the response open until
   * the render finishes, within its plan-bounded deadline. Returns a {@link CreateSyncResult} whose
   * `kind` distinguishes a finished document as JSON (`document`, with a signed `download.url`), the
   * raw PDF bytes (`pdf`), or a deadline fallback (`pending`) whose id you then poll. One HTTP call, no
   * client-side polling.
   *
   * By default you get the finished document as JSON with the download url. Pass `{ pdf: true }` to
   * stream the raw PDF bytes instead (protected/failed documents always come back as JSON).
   *
   * ```ts
   * // Default: JSON with the signed download url.
   * const out = await pw.documents.createSync({ templateId: "tmpl_invoice", payload });
   * if (out.kind === "document") console.log(out.document.download?.url);
   * else if (out.kind === "pending") await pw.documents.waitFor(out.id); // deadline elapsed
   *
   * // Opt in to raw bytes:
   * const res = await pw.documents.createSync({ templateId: "tmpl_invoice", payload }, { pdf: true });
   * if (res.kind === "pdf") fs.writeFileSync("invoice.pdf", res.pdf);
   * ```
   */
  async createSync(
    params: CreateDocumentParams,
    opts: CreateSyncOptions = {},
  ): Promise<CreateSyncResult> {
    const wantPdf = opts.pdf ?? false;
    const { idempotencyKey, ...rest } = params;
    const headers: Record<string, string> = { prefer: "wait" };
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    if (wantPdf) headers["accept"] = "application/pdf";

    const res = await this.http.request("POST", "/v1/documents", {
      body: rest,
      headers,
      signal: opts.signal,
    });

    // Content-negotiated: raw PDF bytes, or JSON (a finished document, or the 202 fallback).
    if (/application\/pdf/i.test(res.headers.get("content-type") ?? "")) {
      return {
        kind: "pdf",
        id: res.headers.get("x-document-id"),
        version: numberOrNull(res.headers.get("x-document-version")),
        pdf: new Uint8Array(await res.arrayBuffer()),
      };
    }
    const text = await res.text();
    const body = (text ? JSON.parse(text) : {}) as Document & { status: DocumentStatus };
    if (res.status === 202) {
      return { kind: "pending", id: body.id, version: body.version ?? null, status: body.status };
    }
    return { kind: "document", document: body };
  }

  /**
   * A document's per-page geometry (widthPts/heightPts) plus whether extracted text and a thumbnail
   * exist — enough to place comment anchors without rendering the PDF yourself.
   */
  pages(id: string, signal?: AbortSignal): Promise<DocumentPageInfo[]> {
    return this.http.json<DocumentPageInfo[]>(
      "GET",
      `/v1/documents/${encodeURIComponent(id)}/pages`,
      { signal },
    );
  }

  /**
   * Carry open comment threads forward from a previous same-template document onto this one (the
   * text-quote → context → page-similarity ladder). Returns `202`; observe progress via
   * {@link commentMigration} and the threads' `migrationStatus`.
   */
  migrateComments(
    id: string,
    params: MigrateCommentsParams,
    signal?: AbortSignal,
  ): Promise<MigrateCommentsResult> {
    return this.http.json<MigrateCommentsResult>(
      "POST",
      `/v1/documents/${encodeURIComponent(id)}/migrate-comments`,
      { body: params, signal },
    );
  }

  /** The comment-migration rollup for a document, grouped by migration status. */
  commentMigration(id: string, signal?: AbortSignal): Promise<CommentMigrationRollup> {
    return this.http.json<CommentMigrationRollup>(
      "GET",
      `/v1/documents/${encodeURIComponent(id)}/comment-migration`,
      { signal },
    );
  }

  /**
   * Download the finished PDF bytes. For a download-protected document, pass `{ password }`. For an
   * unprotected document, the short-lived signed URL is resolved and fetched automatically.
   */
  async download(id: string, opts: DownloadOptions = {}): Promise<Uint8Array> {
    if (opts.password !== undefined) {
      return this.http.bytes("GET", `/v1/documents/${encodeURIComponent(id)}/content`, {
        headers: { "x-document-password": opts.password },
        noAuth: true,
        signal: opts.signal,
      });
    }
    const doc = await this.get(id, opts.signal);
    if (doc.status !== "done" || !doc.download?.url) {
      throw new PageWeaverDocumentFailedError(doc);
    }
    if (doc.download.protected) {
      throw new PageWeaverDocumentFailedError({
        ...doc,
        error: "Document is download-protected; supply a `password` to download it.",
      });
    }
    return this.http.fetchUrlBytes(doc.download.url, opts.signal);
  }
}

/** Parse a numeric response-header value, or null when it is absent/non-numeric. */
function numberOrNull(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Delay `ms`, rejecting early if the signal aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Aborted"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
