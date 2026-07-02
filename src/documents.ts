import type { HttpClient } from "./http";
import { PageWeaverDocumentFailedError, PageWeaverTimeoutError } from "./errors";
import type {
  CreateDocumentParams,
  CreateDocumentResult,
  Document,
  DocumentPage,
  ListDocumentsParams,
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

  /** Fetch the current state of a document. When `status` is "done" it carries a `download` block. */
  get(id: string, signal?: AbortSignal): Promise<Document> {
    return this.http.json<Document>("GET", `/v1/documents/${encodeURIComponent(id)}`, { signal });
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
