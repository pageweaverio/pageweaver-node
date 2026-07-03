import { PageWeaverApiError, PageWeaverConnectionError } from "./errors";

/** A `fetch` implementation compatible with the global one (Node 18+, browsers, undici). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  apiKey: string;
  /** API base URL. Defaults to https://api.pageweaver.io; point it at http://localhost:4000 in dev. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Inject a custom fetch (defaults to the global). */
  fetch?: FetchLike;
}

export interface RequestInitLite {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip attaching the `x-api-key` header (used by the recipient-facing content endpoint). */
  noAuth?: boolean;
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = "https://api.pageweaver.io";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Thin fetch wrapper: attaches the API key, serializes JSON, applies a timeout, and maps
 * non-2xx responses to {@link PageWeaverApiError} and transport failures to
 * {@link PageWeaverConnectionError}. Every resource is built on this.
 */
export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(opts: HttpClientOptions) {
    if (!opts.apiKey) throw new PageWeaverConnectionError("An `apiKey` is required.");
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
  }

  /** Perform a request and parse a JSON response into `T`. */
  async json<T>(method: string, path: string, init: RequestInitLite = {}): Promise<T> {
    const res = await this.send(method, path, init);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Perform a request and return the raw response body as bytes (for PDF downloads). */
  async bytes(method: string, path: string, init: RequestInitLite = {}): Promise<Uint8Array> {
    const res = await this.send(method, path, init);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  /**
   * Perform a request and return the raw {@link Response} (2xx only; non-2xx still throws a
   * {@link PageWeaverApiError}). For content-negotiated endpoints where the body may be JSON or bytes
   * depending on the response — e.g. synchronous create, which returns PDF, a document, or a 202.
   */
  request(method: string, path: string, init: RequestInitLite = {}): Promise<Response> {
    return this.send(method, path, init);
  }

  /** Fetch an absolute URL (e.g. a signed download URL) and return its bytes. */
  async fetchUrlBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const { controller, done } = this.withTimeout(signal);
    try {
      const res = await this.fetchImpl(url, { method: "GET", signal: controller.signal });
      if (!res.ok) {
        throw new PageWeaverApiError({
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

  private async send(method: string, path: string, init: RequestInitLite): Promise<Response> {
    const url = this.baseUrl + path + buildQuery(init.query);
    const headers: Record<string, string> = { accept: "application/json", ...init.headers };
    if (!init.noAuth) headers["x-api-key"] = this.apiKey;

    let body: string | undefined;
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.body);
    }

    const { controller, done } = this.withTimeout(init.signal);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
    } catch (err) {
      throw this.wrapTransport(err);
    } finally {
      done();
    }

    if (!res.ok) throw await toApiError(res);
    return res;
  }

  /** Compose a timeout AbortController with an optional caller-supplied signal. */
  private withTimeout(signal?: AbortSignal): { controller: AbortController; done: () => void } {
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
    if (err instanceof PageWeaverApiError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    return new PageWeaverConnectionError(
      aborted ? `Request timed out after ${this.timeoutMs}ms.` : `Request failed: ${describe(err)}`,
      err,
    );
  }
}

function buildQuery(query?: Record<string, string | number | undefined>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function toApiError(res: Response): Promise<PageWeaverApiError> {
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
  return new PageWeaverApiError({
    status: res.status,
    message,
    code: typeof record.code === "string" ? record.code : undefined,
    errors: record.errors,
    body,
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
