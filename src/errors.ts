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

/**
 * The API returned a non-2xx response. `status` is the HTTP status; `code`/`errors` are
 * pulled from the JSON body when present (e.g. payload validation errors on a 400), and
 * `body` is the raw parsed body for anything the typed fields don't cover.
 */
export class PageWeaverApiError extends PageWeaverError {
  readonly status: number;
  readonly code?: string;
  readonly errors?: unknown;
  readonly body: unknown;

  constructor(args: { status: number; message: string; code?: string; errors?: unknown; body: unknown }) {
    super(args.message);
    this.name = "PageWeaverApiError";
    this.status = args.status;
    this.code = args.code;
    this.errors = args.errors;
    this.body = args.body;
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
