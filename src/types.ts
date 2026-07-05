// Request/response shapes for the PageWeaver public API (`/v1/*`), hand-mirrored from the
// server DTOs so the SDK stays self-contained (no dependency on the internal workspace
// packages, which are private and unpublishable). Keep these in sync with:
//   apps/api/src/renders/dto/create-render.dto.ts   (RenderOptions + CreateRenderDto)
//   apps/api/src/renders/renders.service.ts          (Create/Document/List result shapes)
//   apps/api/src/templates/templates.service.ts      (discovery shapes)
//   apps/api/src/schemas/schemas.service.ts
// A drift-guard test against a captured openapi.json is a good future addition.

/** A terminal or in-flight document status. */
export type DocumentStatus = "queued" | "rendering" | "done" | "failed";

// ─── options.* (the single nested per-render override key) ──────────────────────

export interface PageOptions {
  /** Standard paper size, e.g. "A4" or "Letter". */
  size?: string;
  /** Page orientation (requires `size`). */
  orientation?: "portrait" | "landscape";
  /** CSS margin shorthand: 1-4 space-separated lengths (mm/cm/in/px/pt), e.g. "18mm". */
  margin?: string;
  /** Render scale, 0.1 to 2.0. */
  scale?: number;
}

export interface RenderingOptions {
  /** CSS media type Chromium emulates. */
  media?: "screen" | "print";
  /** Print background graphics/colours. */
  printBackground?: boolean;
  /** Transparent background (implies printBackground). */
  omitBackground?: boolean;
  /** Collapse the whole document onto one tall page. */
  singlePage?: boolean;
  /** Honour the document's CSS @page size over the API paper params. */
  preferCssPageSize?: boolean;
  /** Pages to print, e.g. "1-3,5". Empty means all. */
  pageRanges?: string;
}

export interface MetadataOptions {
  /** PDF Title (also the header/footer {{title}}). Liquid tokens resolve. */
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
}

/** A running header or footer band. Slots accept literal text plus {{field}} / {{@page}} tokens. */
export interface BandOptions {
  /** Show the band. Omitting it while any slot has text auto-enables it. */
  enabled?: boolean;
  left?: string;
  /** e.g. "Page {{@page}} of {{@pages}}". */
  center?: string;
  right?: string;
  fontSizePt?: number;
  /** Hex or CSS colour name. */
  color?: string;
}

export interface WatermarkOptions {
  /** Watermark text (empty means off). Tokens resolve. */
  text?: string;
  /** Pages to mark, e.g. "1-3". Empty means all. */
  pages?: string;
  fontSizePt?: number;
  color?: string;
  /** Opacity 0 to 1. */
  opacity?: number;
  /** Rotation in degrees, 0 to 360. */
  rotation?: number;
}

export interface StructureOptions {
  /** Emit PDF bookmarks/outline from the document headings. */
  outline?: boolean;
  /** Emit a tagged (accessible) PDF structure. */
  taggedPdf?: boolean;
}

export interface LocalizationOptions {
  /** BCP-47 locale for date/number/currency formatting, e.g. "de-DE". */
  locale?: string;
  /** IANA time zone, e.g. "Europe/Berlin". */
  timeZone?: string;
  /** ISO 4217 currency, e.g. "EUR". */
  currency?: string;
}

export interface PdfPermissions {
  printing?: boolean;
  copying?: boolean;
  modifying?: boolean;
  annotating?: boolean;
  fillingForms?: boolean;
  assembling?: boolean;
}

export interface PdfSecurityOptions {
  /** Password required to open the PDF (PDF-level encryption). */
  userPassword?: string;
  /** Owner password for full permissions. */
  ownerPassword?: string;
  permissions?: PdfPermissions;
}

/**
 * Download protection: a password that gates streaming the document from the PageWeaver
 * download endpoint, separate from the PDF's own open-password.
 */
export interface DownloadSecurityOptions {
  /** Enable the download password. */
  enabled?: boolean;
  /** The password recipients must supply to fetch the PDF. */
  password?: string;
  /** Generate a strong random download password (returned in the response). */
  generate?: boolean;
}

/** Per-render PAdES digital-signing options under `options.security.signature`. */
export interface SignatureOptions {
  enabled?: boolean;
  reason?: string;
  location?: string;
  contactInfo?: string;
  /** "platform" (PageWeaver self-signed) or "byo" (your uploaded certificate, Enterprise). */
  certSource?: "platform" | "byo";
  /** Add an RFC 3161 trusted timestamp (PAdES-B-T) proving when the document was signed. */
  timestamp?: boolean;
}

export interface SecurityOptions {
  pdf?: PdfSecurityOptions;
  download?: DownloadSecurityOptions;
  signature?: SignatureOptions;
}

/**
 * Direct-to-storage delivery routing under `options.delivery` (BYOS). Overrides the template's
 * delivery setting for this render. `mode`: "all" = every enabled destination; "none" = don't deliver
 * this document; "selected" = only `destinationIds`. Ids your account doesn't own are ignored.
 */
export interface DeliveryOptions {
  mode?: "all" | "none" | "selected";
  destinationIds?: string[];
}

/**
 * The single nested per-render `options` block. Every field is layered on the template
 * version's frozen settings for this render only. Unknown keys are rejected by the API (400).
 */
export interface RenderOptions {
  page?: PageOptions;
  rendering?: RenderingOptions;
  metadata?: MetadataOptions;
  header?: BandOptions;
  footer?: BandOptions;
  watermark?: WatermarkOptions;
  structure?: StructureOptions;
  localization?: LocalizationOptions;
  security?: SecurityOptions;
  delivery?: DeliveryOptions;
}

// ─── POST /v1/documents ─────────────────────────────────────────────────────────

/**
 * Output selector: produce a raster image (png/jpeg/webp) instead of a PDF. With only `width`, the
 * image height grows proportionally to fit the page; add `height` + `clip` for an exact crop.
 * `quality` is jpeg/webp compression; `transparent` gives a transparent background (png/webp).
 */
export interface ImageOutput {
  /** "pdf" (default) or a raster image format. */
  format?: "pdf" | "png" | "jpeg" | "webp";
  /** Viewport width in px. With only width set, the height grows proportionally. */
  width?: number;
  /** Viewport height in px. Pair with `clip` for an exact crop. */
  height?: number;
  /** Clip the image to width×height (an exact crop) instead of capturing the full page. */
  clip?: boolean;
  /** Compression quality 1-100 (jpeg/webp only). */
  quality?: number;
  /** Transparent background (png/webp only). */
  transparent?: boolean;
  /** Trade some image quality for a faster capture. */
  optimizeForSpeed?: boolean;
}

interface CreateDocumentCommon {
  /** Data merged into the template/HTML via Liquid. */
  payload?: Record<string, unknown>;
  /** Per-render option overrides, nested under this one key. */
  options?: RenderOptions;
  /** Produce a raster image instead of a PDF (template + inline renders only). */
  output?: ImageOutput;
  /**
   * A unique token you generate per document so a retried request returns the original
   * document instead of creating a duplicate. Sent as the `Idempotency-Key` header.
   */
  idempotencyKey?: string;
  /** HTTPS URL to receive a signed webhook POST when the document reaches a terminal state. */
  callbackUrl?: string;
}

/** Render a published template. */
export interface CreateFromTemplateParams extends CreateDocumentCommon {
  /** Template id (or the built-in "sample-invoice"). */
  templateId: string;
  /** Data merged into the template. Required and validated against the template's schema. */
  payload: Record<string, unknown>;
  /** Pin a published template version; defaults to the template's latest. */
  version?: number;
  /** Validate against this schema instead of the one the template pins (account-owned). */
  schemaId?: string;
  /** Pin a published schema version (requires `schemaId`); defaults to that schema's latest. */
  schemaVersion?: number;
  html?: never;
  css?: never;
  url?: never;
}

/** Render raw inline HTML with no template. No external images, stylesheets, or JavaScript. */
export interface CreateFromInlineParams extends CreateDocumentCommon {
  /** Raw HTML to convert. May use Liquid tokens and reference account image assets by name. */
  html: string;
  /** CSS applied to the inline HTML (injected as a <style>). */
  css?: string;
  templateId?: never;
  url?: never;
  version?: never;
  schemaId?: never;
  schemaVersion?: never;
}

/**
 * Snapshot a live external web page to a PDF (url-to-pdf). Available on paid plans; every fetch is
 * SSRF-checked. No template, payload, schema, or image output — it produces a PDF of the page.
 */
export interface CreateFromUrlParams extends CreateDocumentCommon {
  /** The https URL of the page to snapshot. */
  url: string;
  templateId?: never;
  html?: never;
  css?: never;
  payload?: never;
  version?: never;
  schemaId?: never;
  schemaVersion?: never;
  output?: never;
}

export type CreateDocumentParams =
  | CreateFromTemplateParams
  | CreateFromInlineParams
  | CreateFromUrlParams;

/** The owner-visible download block, present when a document is download-protected. */
export interface DownloadInfo {
  protected: boolean;
  requiresPassword: boolean;
  /** The plaintext download password, returned only to the authenticated owner. */
  password?: string;
  /** A short-lived signed URL (unprotected), or the content endpoint URL (protected). */
  url?: string;
}

/** The `202` body from creating (or idempotently returning) a document. */
export interface CreateDocumentResult {
  id: string;
  status: DocumentStatus;
  /** Null for an inline render (it had no template). */
  version: number | null;
  download?: DownloadInfo;
}

/**
 * The outcome of a synchronous ({@link DocumentsResource.createSync}) create. Discriminated on `kind`:
 *   - `pdf`      — an unprotected document finished within the deadline and its bytes were streamed.
 *   - `document` — a finished document as JSON: a download-protected or failed document, or when raw
 *                  bytes were not requested. Inspect `document.status`.
 *   - `pending`  — the wait deadline elapsed first; the render continues. Poll `id` (or await a
 *                  webhook) to get the result.
 */
export type CreateSyncResult =
  | { kind: "pdf"; id: string | null; version: number | null; pdf: Uint8Array }
  | { kind: "document"; document: Document }
  | { kind: "pending"; id: string; version: number | null; status: DocumentStatus };

/**
 * A document's integrity fingerprint, present once it has finished rendering. Re-hash your copy of
 * the PDF with `hashAlg` (SHA-256) and compare to `contentHash` to prove it is unaltered.
 */
export interface DocumentIntegrity {
  /** Lowercase hex SHA-256 of the issued PDF bytes. */
  contentHash: string;
  hashAlg: string;
  /** 1-based position in your account's append-only hash chain. */
  chainSeq: number | null;
  /** Digital-signature status; null when the document is unsigned. */
  signature?: DocumentSignature | null;
}

/** A document's PAdES digital-signature status; null when the document is unsigned. */
export interface DocumentSignature {
  /** Signature algorithm label, e.g. "RSA-SHA256 / PAdES-B". */
  algorithm: string | null;
  /** Lowercase hex SHA-256 fingerprint of the signer certificate. */
  signerCertFingerprint: string | null;
  /** "platform" (PageWeaver self-signed) or "byo" (your own certificate). */
  signerCertSource: string | null;
  signedAt: string | null;
  /** Whether the signer certificate chains to a public trust anchor (a "byo" cert is trusted). */
  trusted: boolean;
  /**
   * RFC 3161 trusted timestamp on the signature (PAdES-B-T); null when not timestamped. `at` is the
   * TSA-attested signing time (independent of PageWeaver's clock); `authority` is the issuing TSA.
   */
  timestamp: { at: string | null; authority: string | null } | null;
}

/** The `GET /v1/documents/:id` body. */
export interface Document {
  id: string;
  status: DocumentStatus;
  version: number | null;
  /** The output format this document produces: "pdf" (default), "png", "jpeg", or "webp". */
  outputFormat: string;
  download?: DownloadInfo;
  /** Present when `status` is "failed". */
  error?: string;
  /** The per-render options the document was created with; null if none. */
  appliedOptions?: Record<string, unknown> | null;
  /** Content fingerprint + chain position; null until the document has finished rendering. */
  integrity?: DocumentIntegrity | null;
}

/** The `GET /v1/documents/:id/verify` body: tamper-evidence + hash-chain attestation. */
export interface DocumentVerification {
  documentId: string;
  status: DocumentStatus;
  /** SHA-256 of the issued PDF, or null if not rendered yet. */
  contentHash: string | null;
  hashAlg: string | null;
  chainSeq: number | null;
  /**
   * Whether this document's chain link recomputes correctly from its predecessor. False if a row was
   * altered or re-ordered; null when the document isn't chained yet.
   */
  chainVerified: boolean | null;
  /** ISO 8601 timestamp the document was issued. */
  issuedAt: string | null;
  /** Digital-signature status; null when the document is unsigned. */
  signature: DocumentSignature | null;
}

/** One row in the document history list. */
export interface DocumentListItem {
  id: string;
  templateId: string | null;
  version: number | null;
  status: DocumentStatus;
  source: string;
  /** Output format: "pdf" | "png" | "jpeg" | "webp". */
  outputFormat: string;
  pages: number | null;
  bytes: number | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  finishedAt: string | null;
  pdfAvailable: boolean;
  pdfExpiresAt: string | null;
  error: string | null;
}

export interface ListDocumentsParams {
  status?: DocumentStatus;
  templateId?: string;
  cursor?: string;
  /** 1 to 100, default 25. */
  limit?: number;
}

export interface DocumentPage {
  items: DocumentListItem[];
  /** Pass to the next `list` call to fetch the following page; null when there are no more. */
  nextCursor: string | null;
}

// ─── GET /v1/templates, /v1/schemas (discovery, read only) ──────────────────────

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  /** 0 for a template that has never been published (not yet renderable). */
  currentVersion: number;
  /** ISO 8601 timestamp. */
  updatedAt: string;
}

export interface Template extends TemplateSummary {
  editorMode: string;
  schemaId: string | null;
  schemaVersion: number | null;
}

export interface TemplateVersionSummary {
  version: number;
  note: string | null;
  /** ISO 8601 timestamp. */
  publishedAt: string;
  derivedFromVersion: number | null;
}

export interface SchemaSummary {
  id: string;
  name: string;
  description: string | null;
  /** ISO 8601 timestamp. */
  updatedAt: string;
}

export interface Schema {
  id: string;
  name: string;
  description: string | null;
  version: number;
  /** The published JSON Schema (as a JSON value). */
  schema: unknown;
  /** A derived sample payload conforming to the schema. */
  sample: unknown;
}

export interface SchemaVersionSummary {
  version: number;
  note: string | null;
  /** ISO 8601 timestamp. */
  publishedAt: string;
}

// ─── GET /v1/usage ──────────────────────────────────────────────────────────────

export interface Usage {
  /** The billing period label, e.g. "2026-08". */
  period: string;
  /** Billable API document pages consumed this period. */
  pages: number;
  /** Monthly page allowance for the plan. */
  limit: number;
  /** Editor PDF-preview pages consumed this period (a separate budget). */
  previewPages: number;
  previewLimit: number;
}
