import type { Document } from "./types";

/** Base class for every error the SDK throws. Catch this to handle any SDK failure. */
export class PageWeaverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageWeaverError";
    // Restore the prototype chain when compiled to ES5-ish targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ApiErrorArgs {
  status: number;
  message: string;
  /** A stable dot-namespaced code from the API's error registry (`GET /v1/errors`), e.g. `formtemplate.malware_detected`. Absent on pre-registry failures. */
  code?: string;
  /** Field-level validation errors, when present (typically on a 400). */
  errors?: unknown;
  /** The raw parsed response body. */
  body: unknown;
  /** `Retry-After` response header, seconds, when present (429/503). */
  retryAfterSeconds?: number;
  /** The account-scoped `X-Request-Id`/correlation id, when the API sent one, for support tickets. */
  requestId?: string;
}

/**
 * The API returned a non-2xx response. `status` is the HTTP status; `code`/`errors` are
 * pulled from the JSON body when present (e.g. payload validation errors on a 400), and
 * `body` is the raw parsed body for anything the typed fields don't cover.
 *
 * Prefer catching one of the specific subclasses below ({@link PageWeaverAuthenticationError},
 * {@link PageWeaverPermissionError}, {@link PageWeaverNotFoundError}, {@link PageWeaverConflictError},
 * {@link PageWeaverValidationError}, {@link PageWeaverRateLimitError}, {@link PageWeaverServerError}) when
 * you want to branch on the failure kind; every one of them is also a `PageWeaverAPIError`, so a single
 * `catch (err) { if (err instanceof PageWeaverAPIError) ... }` still catches all of them.
 */
export class PageWeaverAPIError extends PageWeaverError {
  readonly status: number;
  readonly code?: string;
  readonly errors?: unknown;
  readonly body: unknown;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;

  constructor(args: ApiErrorArgs) {
    super(args.message);
    this.name = "PageWeaverAPIError";
    this.status = args.status;
    this.code = args.code;
    this.errors = args.errors;
    this.body = args.body;
    this.retryAfterSeconds = args.retryAfterSeconds;
    this.requestId = args.requestId;
  }

  /** Whether retrying this exact request (with the same idempotency key, if any) may succeed. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** `401` — the API key is missing, malformed, revoked, or the account is suspended/scheduled for deletion. */
export class PageWeaverAuthenticationError extends PageWeaverAPIError {
  constructor(args: ApiErrorArgs) {
    super(args);
    this.name = "PageWeaverAuthenticationError";
  }
}

/** The API's stable code for "this API key authenticated fine but lacks a required scope". */
const SCOPE_MISSING_CODE = "authorization.scope_missing";

/**
 * `403` — the API key authenticated fine but is not allowed to do this: either it lacks a required
 * scope ({@link isScopeMissing} true, {@link requiredScope} names it — mint a new key with that scope
 * in the portal), or the account can't see this resource for another reason (e.g. an object-type access
 * policy). This is a credential problem, distinct from {@link PageWeaverPlanRequiredError} (a billing
 * problem: the credential is fine, the feature isn't on the plan at all).
 */
export class PageWeaverPermissionError extends PageWeaverAPIError {
  constructor(args: ApiErrorArgs) {
    super(args);
    this.name = "PageWeaverPermissionError";
  }

  /** True when this 403 is specifically a missing-scope refusal (`code === "authorization.scope_missing"`). */
  get isScopeMissing(): boolean {
    return this.code === SCOPE_MISSING_CODE;
  }

  /**
   * The scope name the key is missing (e.g. `"review"`), when {@link isScopeMissing} is true and the
   * API's message named it (best-effort parse of "missing the 'X' scope" — falls back to `undefined`
   * rather than guessing). Mint a new API key with that scope in the portal to resolve it.
   */
  get requiredScope(): string | undefined {
    if (!this.isScopeMissing) return undefined;
    return /missing the '([^']+)' scope/.exec(this.message)?.[1];
  }
}

/** `404` — no such resource, or it belongs to another tenant (the API never distinguishes the two). */
export class PageWeaverNotFoundError extends PageWeaverAPIError {
  constructor(args: ApiErrorArgs) {
    super(args);
    this.name = "PageWeaverNotFoundError";
  }
}

/** `409` — an optimistic-concurrency mismatch (`expectedVersion`/`If-Match`), a duplicate key, or a state conflict. */
export class PageWeaverConflictError extends PageWeaverAPIError {
  constructor(args: ApiErrorArgs) {
    super(args);
    this.name = "PageWeaverConflictError";
  }
}

/** `400` / `422` — the request body or query failed validation. `errors` carries the field-level detail when present. */
export class PageWeaverValidationError extends PageWeaverAPIError {
  constructor(args: ApiErrorArgs) {
    super(args);
    this.name = "PageWeaverValidationError";
  }
}

/**
 * `402` — a billing problem, not a credential one: the account's PLAN doesn't include this capability
 * at all (e.g. provenance receipts, proof packs, document versioning, deployments, digital signing,
 * structured e-invoice output, public alias links). No API key, however scoped, can call this
 * successfully until the account upgrades — contrast with {@link PageWeaverPermissionError}, where the
 * feature is available but this specific key isn't allowed to use it.
 */
export class PageWeaverPlanRequiredError extends PageWeaverAPIError {
  constructor(args: ApiErrorArgs) {
    super(args);
    this.name = "PageWeaverPlanRequiredError";
  }
}

/** `429` — rate limited or over a usage quota. `retryAfterSeconds` is set when the API sent `Retry-After`. */
export class PageWeaverRateLimitError extends PageWeaverAPIError {
  constructor(args: ApiErrorArgs) {
    super(args);
    this.name = "PageWeaverRateLimitError";
  }
}

/** `5xx` — the API failed unexpectedly. Safe to retry (the HTTP client already retries these automatically). */
export class PageWeaverServerError extends PageWeaverAPIError {
  constructor(args: ApiErrorArgs) {
    super(args);
    this.name = "PageWeaverServerError";
  }
}

/** Build the right {@link PageWeaverAPIError} subclass for a status code. */
export function apiErrorForStatus(args: ApiErrorArgs): PageWeaverAPIError {
  switch (args.status) {
    case 400:
    case 422:
      return new PageWeaverValidationError(args);
    case 401:
      return new PageWeaverAuthenticationError(args);
    case 402:
      return new PageWeaverPlanRequiredError(args);
    case 403:
      return new PageWeaverPermissionError(args);
    case 404:
      return new PageWeaverNotFoundError(args);
    case 409:
      return new PageWeaverConflictError(args);
    case 429:
      return new PageWeaverRateLimitError(args);
    default:
      return args.status >= 500 ? new PageWeaverServerError(args) : new PageWeaverAPIError(args);
  }
}

/** A network-level failure: connection refused, DNS, or an aborted/timed-out request. */
export class PageWeaverConnectionError extends PageWeaverError {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PageWeaverConnectionError";
    this.cause = cause;
  }
}

/**
 * A request body failed a client-side shape check before it was sent — no network call was made. Fix
 * `message`; `path` names the offending field when known.
 */
export class PageWeaverInvalidRequestError extends PageWeaverError {
  readonly path?: string;
  constructor(message: string, path?: string) {
    super(message);
    this.name = "PageWeaverInvalidRequestError";
    this.path = path;
  }
}

/** `waitFor`/`createAndWait` exceeded its timeout before the document reached a terminal state. */
export class PageWeaverTimeoutError extends PageWeaverError {
  readonly documentId: string;
  readonly lastStatus: string;
  constructor(documentId: string, lastStatus: string, timeoutMs: number) {
    super(
      `Timed out after ${timeoutMs}ms waiting for document ${documentId} (last status: ${lastStatus}).`,
    );
    this.name = "PageWeaverTimeoutError";
    this.documentId = documentId;
    this.lastStatus = lastStatus;
  }
}

/**
 * The document reached the terminal `failed` state while waiting. Thrown by
 * `waitFor`/`createAndWait` unless `throwOnFailure: false` is set. `document` carries the
 * final response (including its `error` string).
 */
export class PageWeaverDocumentFailedError extends PageWeaverError {
  readonly document: Document;
  constructor(document: Document) {
    super(`Document ${document.id} failed: ${document.error ?? "unknown error"}`);
    this.name = "PageWeaverDocumentFailedError";
    this.document = document;
  }
}
