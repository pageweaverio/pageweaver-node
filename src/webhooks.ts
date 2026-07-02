import { createHmac, timingSafeEqual } from "node:crypto";
import { PageWeaverError } from "./errors";
import type { DocumentStatus } from "./types";

// PageWeaver signs each webhook delivery with HMAC-SHA256 over the exact request body, keyed by your
// account webhook secret (`whsec_...`), and sends it in the `X-PageWeaver-Signature` header formatted
// `sha256=<hex>`. Verify it on your endpoint before trusting the payload. This logic mirrors the
// server's signer (packages/webhooks) and is inlined here so the SDK has no internal dependencies.

/** Header carrying the `sha256=<hex>` signature. */
export const WEBHOOK_SIGNATURE_HEADER = "x-pageweaver-signature";
/** Header carrying the event name. */
export const WEBHOOK_EVENT_HEADER = "x-pageweaver-event";
/** Header carrying the unix-seconds send time. */
export const WEBHOOK_TIMESTAMP_HEADER = "x-pageweaver-timestamp";

/** Terminal document events. */
export type DocumentWebhookEventName = "document.completed" | "document.failed";
/** Terminal bulk-run (batch) events. */
export type BatchWebhookEventName = "batch.completed" | "batch.failed";
export type WebhookEventName = DocumentWebhookEventName | BatchWebhookEventName;

/** Body delivered for a single-document terminal event. `url` is a short-lived signed download URL. */
export interface DocumentWebhookPayload {
  event: DocumentWebhookEventName;
  documentId: string;
  templateId: string | null;
  version: number | null;
  status: Extract<DocumentStatus, "done" | "failed">;
  url?: string;
  error?: string;
  createdAt: string;
}

/** Body delivered for a bulk-run terminal event. `bundleUrl` is a signed URL to the assembled ZIP. */
export interface BatchWebhookPayload {
  event: BatchWebhookEventName;
  batchId: string;
  templateId: string;
  version: number;
  status: "completed" | "failed";
  totalRows: number;
  succeeded: number;
  failed: number;
  invalidRows: number;
  bundleUrl?: string;
  createdAt: string;
}

export type WebhookPayload = DocumentWebhookPayload | BatchWebhookPayload;

/** Type guard: narrow a verified event to a document payload. */
export function isDocumentEvent(p: WebhookPayload): p is DocumentWebhookPayload {
  return p.event === "document.completed" || p.event === "document.failed";
}

/** Type guard: narrow a verified event to a batch payload. */
export function isBatchEvent(p: WebhookPayload): p is BatchWebhookPayload {
  return p.event === "batch.completed" || p.event === "batch.failed";
}

/** Compute the `sha256=<hex>` signature for a body. Exposed mainly for tests. */
export function signWebhookBody(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

/** Constant-time check of a `sha256=<hex>` signature against the raw body. Never throws. */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string | undefined | null,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signWebhookBody(secret, rawBody), "utf8");
  const actual = Buffer.from(signature, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Thrown when a webhook signature does not match the body. */
export class PageWeaverWebhookSignatureError extends PageWeaverError {
  constructor() {
    super("Invalid webhook signature.");
    this.name = "PageWeaverWebhookSignatureError";
  }
}

export interface VerifyWebhookOptions {
  /** Your account webhook signing secret (`whsec_...`). */
  secret: string;
  /**
   * The exact raw request body bytes, as a string. Use the unparsed body (e.g. `express.raw`),
   * not a re-serialized object: re-stringifying can change the bytes and break the signature.
   */
  body: string;
  /** The `X-PageWeaver-Signature` header value (a single string or the header array). */
  signature: string | string[] | undefined | null;
}

/**
 * Verify a webhook signature and return the parsed, typed event. Throws
 * {@link PageWeaverWebhookSignatureError} if the signature is missing or wrong.
 *
 * ```ts
 * const event = verifyWebhook({ secret, body: rawBody, signature: req.headers["x-pageweaver-signature"] });
 * if (isDocumentEvent(event) && event.status === "done") { ... }
 * ```
 */
export function verifyWebhook(opts: VerifyWebhookOptions): WebhookPayload {
  const signature = Array.isArray(opts.signature) ? opts.signature[0] : opts.signature;
  if (!verifyWebhookSignature(opts.secret, opts.body, signature)) {
    throw new PageWeaverWebhookSignatureError();
  }
  return JSON.parse(opts.body) as WebhookPayload;
}
