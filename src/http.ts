import { apiErrorForStatus, PageWeaverAPIError, PageWeaverConnectionError } from "./errors";

/** A `fetch` implementation compatible with the global one (Node 18+, browsers, undici). */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** The type `fetch`'s `RequestInit.body` accepts, extracted structurally (no DOM lib dependency). */
type FetchBody = NonNullable<RequestInit["body"]>;

export interface HttpClientOptions {
  apiKey: string;
  /** API base URL. Defaults to https://api.pageweaver.io; point it at http://localhost:4000 in dev. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Inject a custom fetch (defaults to the global). */
  fetch?: FetchLike;
  /**
   * Automatic retry policy for transient failures (429, 5xx, and network errors) on requests that are
   * safe to repeat: GET/HEAD/PUT/DELETE always, and POST only when an `Idempotency-Key` header is
   * present (so a retried create can't double-render or double-charge). Set `maxRetries: 0` to disable.
   */
  retry?: RetryOptions;
}

export interface RetryOptions {
  /** Maximum retry attempts after the initial try. Default 2. Set 0 to disable retries entirely. */
  maxRetries?: number;
  /** Base delay before the first retry, ms. Default 300. Doubles each attempt (capped by `maxDelayMs`). */
  baseDelayMs?: number;
  /** Upper bound on the backoff delay, ms, before jitter. Default 5000. */
  maxDelayMs?: number;
}

export interface RequestInitLite {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** A pre-built body (e.g. `FormData`) sent as-is, with no `content-type` set (fetch sets its own). Internal — use {@link HttpClient.jsonMultipart}. */
  raw?: FetchBody;
  headers?: Record<string, string>;
  /** Skip attaching the `x-api-key` header (used by the recipient-facing content endpoint). */
  noAuth?: boolean;
  signal?: AbortSignal;
  /** Override the client's retry policy for this one call (e.g. force-disable for a non-idempotent write). */
  retry?: RetryOptions;
}

const DEFAULT_BASE_URL = "https://api.pageweaver.io";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_MAX_DELAY_MS = 5000;
const RETRIABLE_STATUS: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "PUT", "DELETE"]);

/**
 * Thin fetch wrapper: attaches the API key, serializes JSON, applies a timeout, retries transient
 * failures with backoff, and maps non-2xx responses to a typed {@link PageWeaverAPIError} subclass
 * and transport failures to {@link PageWeaverConnectionError}. Every resource is built on this.
 */
export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly retry: Required<RetryOptions>;

  constructor(opts: HttpClientOptions) {
    if (!opts.apiKey)
      throw new PageWeaverConnectionError("An `apiKey` is required.");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const resolved = opts.fetch ?? globalFetch;
    if (!resolved) {
      throw new PageWeaverConnectionError(
        "No global `fetch` is available. Use Node 18+ or pass a `fetch` implementation.",
      );
    }
    this.fetchImpl = resolved;
    this.retry = {
      maxRetries: opts.retry?.maxRetries ?? DEFAULT_MAX_RETRIES,
      baseDelayMs: opts.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
      maxDelayMs: opts.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    };
  }

  /** Perform a request and parse a JSON response into `T`. */
  async json<T>(
    method: string,
    path: string,
    init: RequestInitLite = {},
  ): Promise<T> {
    const res = await this.send(method, path, init);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * Perform a multipart/form-data request (file upload) and parse a JSON response into `T`. String
   * fields and file parts are both accepted; `fetch` sets the multipart boundary `content-type`
   * itself, so none is set here. Multipart bodies are never retried (the file stream can't be
   * safely replayed), regardless of the client's retry policy.
   */
  async jsonMultipart<T>(
    method: string,
    path: string,
    parts: {
      fields?: Record<string, string | number | boolean | undefined>;
      files?: Record<string, { data: Uint8Array | ArrayBuffer | Blob; filename: string; contentType?: string }>;
    },
    init: Omit<RequestInitLite, "body"> = {},
  ): Promise<T> {
    const FormDataCtor = (globalThis as { FormData?: typeof FormData }).FormData;
    const BlobCtor = (globalThis as { Blob?: typeof Blob }).Blob;
    if (!FormDataCtor || !BlobCtor) {
      throw new PageWeaverConnectionError(
        "No global `FormData`/`Blob` is available. Use Node 18+ (or a browser) for multipart uploads.",
      );
    }
    const form = new FormDataCtor();
    for (const [key, value] of Object.entries(parts.fields ?? {})) {
      if (value !== undefined) form.append(key, String(value));
    }
    for (const [field, file] of Object.entries(parts.files ?? {})) {
      const blob =
        file.data instanceof BlobCtor
          ? (file.data as Blob)
          : new BlobCtor([file.data] as ConstructorParameters<typeof Blob>[0], {
              type: file.contentType,
            });
      form.append(field, blob, file.filename);
    }
    const res = await this.send(method, path, { ...init, raw: form, retry: { maxRetries: 0 } });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Perform a request and return the raw response body as bytes (for PDF downloads). */
  async bytes(
    method: string,
    path: string,
    init: RequestInitLite = {},
  ): Promise<Uint8Array> {
    const res = await this.send(method, path, init);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  /**
   * Perform a request and return the raw {@link Response} (2xx only; non-2xx still throws a
   * {@link PageWeaverAPIError}). For content-negotiated endpoints where the body may be JSON or bytes
   * depending on the response — e.g. synchronous create, which returns PDF, a document, or a 202.
   */
  request(
    method: string,
    path: string,
    init: RequestInitLite = {},
  ): Promise<Response> {
    return this.send(method, path, init);
  }

  /** Fetch an absolute URL (e.g. a signed download URL) and return its bytes. */
  async fetchUrlBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const { controller, done } = this.withTimeout(signal);
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw apiErrorForStatus({
          status: res.status,
          message: `Failed to download from ${url}: ${res.status}`,
          body: await safeText(res),
        });
      }
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      throw this.wrapTransport(err);
    } finally {
      done();
    }
  }

  private async send(
    method: string,
    path: string,
    init: RequestInitLite,
  ): Promise<Response> {
    const url = this.baseUrl + path + buildQuery(init.query);
    const headers: Record<string, string> = {
      accept: "application/json",
      ...init.headers,
    };
    if (!init.noAuth) headers["x-api-key"] = this.apiKey;

    let body: FetchBody | undefined;
    if (init.raw !== undefined) {
      body = init.raw;
    } else if (init.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.body);
    }

    const retry = { ...this.retry, ...init.retry };
    const upperMethod = method.toUpperCase();
    const retryable =
      retry.maxRetries > 0 &&
      (SAFE_METHODS.has(upperMethod) ||
        (upperMethod === "POST" && "idempotency-key" in lowerKeys(headers)));

    let attempt = 0;
    for (;;) {
      const { controller, done } = this.withTimeout(init.signal);
      try {
        let res: Response;
        try {
          res = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
        } catch (err) {
          if (retryable && attempt < retry.maxRetries && !isAbortedByCaller(err, init.signal)) {
            await this.delayForAttempt(attempt, retry, undefined, init.signal);
            attempt++;
            continue;
          }
          throw this.wrapTransport(err);
        }

        if (!res.ok) {
          if (retryable && RETRIABLE_STATUS.has(res.status) && attempt < retry.maxRetries) {
            const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
            await this.delayForAttempt(attempt, retry, retryAfter, init.signal);
            attempt++;
            continue;
          }
          throw await toApiError(res);
        }
        return res;
      } finally {
        done();
      }
    }
  }

  private async delayForAttempt(
    attempt: number,
    retry: Required<RetryOptions>,
    retryAfterSeconds: number | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    const backoff = Math.min(retry.baseDelayMs * 2 ** attempt, retry.maxDelayMs);
    const jittered = backoff / 2 + Math.random() * (backoff / 2);
    const delayMs = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : jittered;
    await sleep(delayMs, signal);
  }

  /** Compose a timeout AbortController with an optional caller-supplied signal. */
  private withTimeout(signal?: AbortSignal): {
    controller: AbortController;
    done: () => void;
  } {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    return {
      controller,
      done: () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      },
    };
  }

  private wrapTransport(err: unknown): PageWeaverConnectionError {
    if (err instanceof PageWeaverAPIError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    return new PageWeaverConnectionError(
      aborted
        ? `Request timed out after ${this.timeoutMs}ms.`
        : `Request failed: ${describe(err)}`,
      err,
    );
  }
}

function lowerKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}

/** True when the caller's own signal (not our timeout controller) caused the abort. */
function isAbortedByCaller(err: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted && err instanceof Error && err.name === "AbortError";
}

function buildQuery(
  query?: Record<string, string | number | undefined>,
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const when = Date.parse(value);
  if (!Number.isNaN(when)) return Math.max(0, (when - Date.now()) / 1000);
  return undefined;
}

async function toApiError(res: Response): Promise<PageWeaverAPIError> {
  const raw = await safeText(res);
  let body: unknown = raw;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    // Non-JSON body: keep the raw text.
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const message =
    (typeof record.message === "string" && record.message) ||
    (Array.isArray(record.message) && record.message.join(", ")) ||
    `Request failed with status ${res.status}`;
  return apiErrorForStatus({
    status: res.status,
    message,
    code: typeof record.code === "string" ? record.code : undefined,
    errors: record.errors,
    body,
    retryAfterSeconds: parseRetryAfter(res.headers.get("retry-after")),
    requestId: res.headers.get("x-request-id") ?? res.headers.get("x-correlation-id") ?? undefined,
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Delay `ms`, rejecting early if the signal aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
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
