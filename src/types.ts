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

/** An account-owned document initiative (Phase 2A). Pass its id or slug as the SDK `project` option. */
export interface Project {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  /** True when it matches the project context selected for this request. */
  active: boolean;
}

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
  /** Print background graphics/colors. */
  printBackground?: boolean;
  /** Transparent background (implies printBackground). */
  omitBackground?: boolean;
  /** Collapse the whole document onto one tall page. */
  singlePage?: boolean;
  /** Honor the document's CSS @page size over the API paper params. */
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
  /** Hex or CSS color name. */
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
  /**
   * Render the version this template is pinned to in the named environment (e.g. "production")
   * instead of a numeric `version`. Mutually exclusive with `version`; fails if the template has no
   * pin in that environment (no silent fallback).
   */
  environment?: string;
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
 * Parameters for a no-render dry-run ({@link DocumentsResource.validate}): check a payload against a
 * template's frozen JSON Schema without rendering. A strict subset of a template create: the fields
 * that select the validation contract, plus the payload.
 */
export interface ValidateDocumentParams {
  /** Template id (or the built-in "sample-invoice") whose schema the payload is checked against. */
  templateId: string;
  /** The data to validate against the template's JSON Schema. */
  payload: Record<string, unknown>;
  /** Check against a published template version; defaults to the template's latest. */
  version?: number;
  /** Check against the version pinned in this environment instead of a numeric `version`. */
  environment?: string;
  /** Validate against this schema instead of the one the template pins (account-owned). */
  schemaId?: string;
  /** Pin a published schema version (requires `schemaId`); defaults to that schema's latest. */
  schemaVersion?: number;
}

/**
 * The result of a no-render validation. `ok` is the branch point; when false, `errors` lists what to
 * fix. The resolved contract (`version`/`schemaId`/`schemaVersion`) is echoed so a caller knows which
 * frozen schema it was checked against, and validating then issuing pin the same version.
 */
export interface ValidateDocumentResult {
  ok: boolean;
  errors: string[];
  templateId: string;
  version: number;
  schemaId: string | null;
  schemaVersion: number | null;
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
  | {
      kind: "pending";
      id: string;
      version: number | null;
      status: DocumentStatus;
    };

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
  /** Whether a signed provenance receipt can be exported for this document (`documents.receipt`). */
  receiptAvailable?: boolean;
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

/** Review activity on a document (beside `integrity`); null when the review layer never touched it. */
export interface DocumentReviewSummary {
  openThreads: number;
  openBlockingThreads: number;
  resolvedThreads: number;
  totalThreads: number;
  /** The open review if one exists, else the most recent; null when none. */
  review: { id: string; status: string; dueAt: string | null } | null;
  approvals: number;
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
  /** Review activity (thread counts, active review, approval tally); null when untouched by reviews. */
  review?: DocumentReviewSummary | null;
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
  contentAvailable: boolean;
  contentExpiresAt: string | null;
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
  /** SHA-256 of the frozen compiled artifact (D92); null for a pre-integrity version. */
  artifactHash: string | null;
  /** True when this is the template's current published version. */
  isCurrent: boolean;
  /** True once a newer version has superseded this one. */
  isSuperseded: boolean;
}

/**
 * A frozen-version attestation (`templates.attest`): an exportable change-control receipt for one
 * published template version. Proves an internal control trail (which version, that it is immutable,
 * when, by whom), NOT a legally-trusted digital signature.
 */
export interface VersionAttestation {
  templateId: string;
  version: number;
  /** SHA-256 of the frozen compiled artifact (64-hex). */
  artifactHash: string;
  prevArtifactHash: string | null;
  /** Whether the artifact recomputes to its stored hash and links to its predecessor. */
  chainVerified: boolean;
  hashAlg: string;
  /** ISO 8601 timestamp. */
  publishedAt: string;
  publishedBy: string | null;
  schemaVersion: number | null;
  isCurrent: boolean;
}

/** Who triggered a render, carried in a provenance receipt. Never contains secret key material. */
export interface ReceiptIdentity {
  accountId: string;
  apiKeyId: string | null;
  apiKeyLabel: string | null;
  source: string;
}

/** The HMAC signature block on a provenance receipt. */
export interface ReceiptSignature {
  alg: string;
  keyId: string;
  /** Lowercase hex HMAC-SHA256 over the canonical unsigned receipt. */
  value: string;
}

/**
 * A signed provenance receipt (`documents.receipt`): binds a document to the request that produced it
 * (`requestHash`), the pinned template version (`artifactHash`), the triggering identity, the issue
 * time, and the content hash + chain link. Verify it offline against the published key.
 */
export interface ProvenanceReceipt {
  documentId: string;
  /** ISO 8601 timestamp. */
  issuedAt: string;
  templateId: string | null;
  version: number | null;
  artifactHash: string | null;
  requestHash: string | null;
  contentHash: string;
  hashAlg: string;
  chainSeq: number;
  chainHash: string;
  identity: ReceiptIdentity;
  signature?: ReceiptSignature;
}

// ── Living documents (F04) ────────────────────────────────────────────────────

/** One immutable version of a living document. */
export interface LivingDocumentVersionInfo {
  seq: number;
  /** The underlying document id — poll `documents.get(documentId)`. */
  documentId: string;
  status: DocumentStatus;
  contentHash: string | null;
  chainSeq: number | null;
  /** The seq that superseded this version, or null while it is the head. */
  supersededBySeq: number | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** A living-document identity without its version list. */
export interface LivingDocumentSummary {
  id: string;
  name: string | null;
  templateId: string;
  templateVersion: number;
  /** The public alias token, or null when none has been published. */
  alias: string | null;
  aliasEnabled: boolean;
  /** The current head version's seq, or null until the first render completes. */
  latestVersion: number | null;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** A living document with its full version history. */
export interface LivingDocumentDetail extends LivingDocumentSummary {
  versions: LivingDocumentVersionInfo[];
}

/** Parameters for `livingDocuments.create`. */
export interface CreateLivingDocumentParams {
  templateId: string;
  /** Pin a specific published version to freeze; defaults to the template's current version. */
  version?: number;
  payload: Record<string, unknown>;
  name?: string;
  /** Publish a public `/d/:alias` link (requires the publicAlias plan capability). */
  publicAlias?: boolean;
}

/** Parameters for `livingDocuments.reissue`. */
export interface ReissueLivingDocumentParams {
  payload: Record<string, unknown>;
}

/** Result of creating a living document: the identity plus the first version's queued document. */
export interface CreateLivingDocumentResult {
  livingDocument: LivingDocumentSummary;
  document: { id: string; status: DocumentStatus };
}

/** Result of reissuing a living document: the identity id plus the new version's queued document. */
export interface ReissueLivingDocumentResult {
  id: string;
  document: { id: string; status: DocumentStatus };
}

/** One page of the living-document list. */
export interface LivingDocumentPage {
  items: LivingDocumentSummary[];
  nextCursor: string | null;
}

/** Parameters for `livingDocuments.list`. */
export interface ListLivingDocumentsParams {
  cursor?: string;
  limit?: number;
}

/** The frozen editor source of a template version (returned by `version(id, n, { include: "source" })`). */
export interface TemplateVersionSource {
  /** Frozen compiled Liquid HTML. */
  compiledHtml: string;
  css: string;
  /** Frozen Gotenberg render settings, or null. */
  renderSettings: Record<string, unknown> | null;
  /** Frozen test-data payload. */
  testData: unknown;
  /** The schema this version pins (null when it uses an inline payload schema). */
  schemaId: string | null;
  schemaVersion: number | null;
  /** The live template's completion-webhook toggle (part of the deploy content hash). */
  notifyOnComplete: boolean;
}

/** One published template version: summary metadata, plus `source` when `include: "source"` was asked. */
export interface TemplateVersionDetail {
  version: number;
  note: string | null;
  publishedAt: string;
  derivedFromVersion: number | null;
  editorMode: string;
  source?: TemplateVersionSource;
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

/** One published schema version: metadata, plus the FieldNode tree when `include: "nodes"` was asked. */
export interface SchemaVersionDetail {
  version: number;
  note: string | null;
  publishedAt: string;
  title: string | null;
  description: string | null;
  /** The frozen typed field tree (FieldNode[]); present only with `include: "nodes"`. */
  nodes?: unknown[];
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
  /** The calling API key's capability scopes (e.g. `["read","render","deploy"]`). */
  scopes: string[];
}

// ─── Review layer: comments, reviews, approvals, share links ────────────────────
// The review endpoints require an API key with the `review` scope. Ids are prefixed opaque strings
// (`cth_` thread, `rev_` review, `apv_` approval, `shl_` share link).

export type AnchorType = "point" | "area" | "text" | "page";
export type ThreadStatus = "open" | "resolved" | "closed";
export type CommentSeverity = "info" | "suggestion" | "blocking";
export type CommentVisibility = "internal" | "external";
export type MigrationStatus =
  | "original"
  | "migrated"
  | "resolved_by_change"
  | "needs_relocation"
  | "failed";

/** A structured `@`mention in a comment body: which member, and the character offset in the body. */
export interface Mention {
  userId: string;
  offset?: number;
}

/** Body of `POST /v1/comments` — create an anchored thread on a rendered document. */
export interface CreateCommentParams {
  documentId: string;
  anchorType: AnchorType;
  pageNumber?: number | null;
  /** Normalized 0–1 coordinates (fractions of the page box). Required per anchor type. */
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  /** For `text` anchors: the quoted string + context + the page-text hash at creation. */
  selectedText?: string;
  textBefore?: string;
  textAfter?: string;
  textHash?: string;
  body: string;
  severity?: CommentSeverity;
  visibility?: CommentVisibility;
  assignedToUserId?: string;
  /** ISO 8601 timestamp. */
  dueAt?: string;
  mentions?: Mention[];
}

/** Body of `PATCH /v1/comments/:id` — edit severity/assignment/due, or relocate the anchor. */
export interface UpdateCommentParams {
  severity?: CommentSeverity;
  assignedToUserId?: string | null;
  dueAt?: string | null;
  pageNumber?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/** Body of `POST /v1/comments/:id/messages` — reply on a thread. */
export interface ReplyParams {
  body: string;
  mentions?: Mention[];
}

export interface CommentMessage {
  id: string;
  body: string;
  mentions: unknown;
  authorUserId: string | null;
  externalAuthorName: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  editedAt: string | null;
}

/** A comment thread on a document. `messages` is present on the single-thread get, not on lists. */
export interface CommentThread {
  id: string;
  documentId: string | null;
  anchorType: string;
  pageNumber: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  selectedText: string | null;
  status: string;
  severity: string;
  visibility: string;
  assignedToUserId: string | null;
  dueAt: string | null;
  createdByUserId: string | null;
  externalAuthorName: string | null;
  resolvedAt: string | null;
  migrationStatus: string;
  migrationConfidence: number | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  messages?: CommentMessage[];
}

export interface CommentThreadPage {
  items: CommentThread[];
  nextCursor: string | null;
}

export interface ListCommentsParams {
  pageNumber?: number;
  status?: ThreadStatus;
  severity?: CommentSeverity;
  cursor?: string;
  /** 1 to 100, default 25. */
  limit?: number;
}

export type ReviewStatus =
  | "open"
  | "completed"
  | "canceled"
  | "expired"
  | "superseded";
export type ParticipantRole = "reviewer" | "approver" | "observer";
export type ParticipantStatus =
  | "pending"
  | "viewed"
  | "commented"
  | "completed"
  | "declined";
export type ApprovalDecision =
  | "approved"
  | "rejected"
  | "approved_with_comments";

/** The completion policy for a review (null fields fall back to platform defaults). */
export interface ReviewPolicy {
  requireAllCommentsResolved?: boolean;
  blockerCommentsPreventApproval?: boolean;
  requiredApproverCount?: number;
  allowApprovalWithOpenComments?: boolean;
}

export interface ParticipantInput {
  userId?: string;
  externalEmail?: string;
  externalName?: string;
  role?: ParticipantRole;
}

/** Body of `POST /v1/reviews`. */
export interface CreateReviewParams {
  documentId: string;
  title?: string;
  message?: string;
  /** ISO 8601 timestamp. */
  dueAt?: string;
  policy?: ReviewPolicy;
  participants?: ParticipantInput[];
}

/** Body of `POST /v1/reviews/:id/participants`. */
export interface AddParticipantParams {
  userId?: string;
  externalEmail?: string;
  externalName?: string;
  role?: ParticipantRole;
}

/** Body of `POST /v1/reviews/:id/approvals`. */
export interface ApprovalParams {
  decision: ApprovalDecision;
  note?: string;
  approverUserId?: string;
}

export interface ReviewParticipant {
  id: string;
  userId: string | null;
  externalEmail: string | null;
  externalName: string | null;
  role: string;
  status: string;
  invitedAt: string;
  viewedAt: string | null;
  completedAt: string | null;
}

export interface Approval {
  id: string;
  decision: string;
  note: string | null;
  approverUserId: string | null;
  externalApproverName: string | null;
  createdAt: string;
}

export interface ReviewPolicyState {
  policy: Required<ReviewPolicy>;
  distinctApprovers: number;
  openThreads: number;
  openBlockingThreads: number;
  requiredApproverCount: number;
  satisfied: boolean;
}

/** A review request. `participants`/`approvals`/`policyState` are present on get, not on lists. */
export interface ReviewRequest {
  id: string;
  documentId: string | null;
  status: string;
  title: string | null;
  message: string | null;
  dueAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  participants?: ReviewParticipant[];
  approvals?: Approval[];
  policyState?: ReviewPolicyState;
}

export interface ReviewPage {
  items: ReviewRequest[];
  nextCursor: string | null;
}

export interface ListReviewsParams {
  status?: ReviewStatus;
  documentId?: string;
  cursor?: string;
  limit?: number;
}

export type ShareLinkTargetType = "render" | "reviewRequest";

/** The external actor's capability set on a share link. */
export interface ShareLinkPermissions {
  canView?: boolean;
  canComment?: boolean;
  canDownload?: boolean;
  canApprove?: boolean;
  requireEmail?: boolean;
  allowedDomains?: string[];
}

/** Body of `POST /v1/share-links`. Provide `documentId` (render) or `reviewRequestId` (review). */
export interface CreateShareLinkParams {
  targetType: ShareLinkTargetType;
  documentId?: string;
  reviewRequestId?: string;
  permissions: ShareLinkPermissions;
  password?: string;
  /** ISO 8601 timestamp. */
  expiresAt?: string;
}

export interface ShareLink {
  id: string;
  targetType: string;
  documentId: string | null;
  reviewRequestId: string | null;
  permissions: ShareLinkPermissions;
  hasPassword: boolean;
  expiresAt: string | null;
  disabledAt: string | null;
  createdAt: string;
}

/** The `POST /v1/share-links` result — the raw `url`/`token` are returned exactly once. */
export interface CreatedShareLink extends ShareLink {
  url: string;
  token: string;
}

export interface ShareLinkList {
  items: ShareLink[];
}

export interface ListShareLinksParams {
  documentId?: string;
  reviewRequestId?: string;
}

/** One row of `GET /v1/documents/:id/pages` — page geometry for anchoring without a viewer. */
export interface DocumentPageInfo {
  pageNumber: number;
  widthPts: number | null;
  heightPts: number | null;
  hasText: boolean;
  hasThumbnail: boolean;
}

/** Body of `POST /v1/documents/:id/migrate-comments`. */
export interface MigrateCommentsParams {
  fromDocumentId: string;
}

export interface MigrateCommentsResult {
  status: string;
}

/** `GET /v1/documents/:id/comment-migration` rollup, grouped by migration status. */
export interface CommentMigrationRollup {
  documentId: string;
  total: number;
  migrated: number;
  resolved_by_change: number;
  needs_relocation: number;
  failed: number;
}

// ── Template proposals (Pillar 2) ───────────────────────────────────────────────

/** A proposal's lifecycle state. */
export type ProposalStatus =
  | "open"
  | "approved"
  | "promoted"
  | "rejected"
  | "superseded";

/** The render-diff regression's progress for a proposal. */
export type ProposalCheckStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

/** Line-level diff magnitude of two text blobs (added / removed lines). */
export interface ProposalTextDiffStats {
  added: number;
  removed: number;
}

/** One dataset's verdict on the render-diff regression: `pass` (unchanged), `changed`, or `error`. */
export type ProposalDatasetResult = "pass" | "changed" | "error";
export type ProposalRegressionMode = "advisory" | "strict";
export type ProposalRegressionCheckName = "hash_equality" | "page_count" | "text_diff";
export type ProposalRegressionCheckStatus = "pass" | "changed" | "informational" | "skipped";

export interface ProposalRegressionCheckResult {
  name: ProposalRegressionCheckName;
  status: ProposalRegressionCheckStatus;
  message: string;
}

export interface ProposalRegressionPolicy {
  mode: ProposalRegressionMode;
  checks: ProposalRegressionCheckName[];
  minSuccessfulFixtures: number;
  failOnErrors: boolean;
}

export interface ProposalFixtureEvidence {
  id: string;
  name: string;
  result: ProposalDatasetResult;
  checks: ProposalRegressionCheckResult[];
}

/** A per-dataset outcome inside {@link ProposalCheckSummary}. */
export interface ProposalDatasetCheck {
  datasetId: string;
  datasetName: string;
  result: ProposalDatasetResult;
  /** Present on `error`: a stable machine code (`render_failed` / `budget_exhausted` / `base_missing`). */
  errorCode?: string;
  /** base → candidate page-count change (candidate - base); null on error. */
  pageCountDelta: number | null;
  basePages: number | null;
  candidatePages: number | null;
  /** True only when the two outputs hashed byte-identical (a strong "unchanged" signal); null on error. */
  hashEqual: boolean | null;
  /** Extracted-text line diff across all pages; null on error. */
  textDiffStats: ProposalTextDiffStats | null;
  checks?: ProposalRegressionCheckResult[];
  /** Signed-URL-servable storage keys for the evidence; null once swept (30d after terminal). */
  artifactKeys: { candidate: string; base: string; diff: string } | null;
}

/** Line diff of the compiled artifact panes (computed once per proposal, not per dataset). */
export interface ProposalArtifactDiff {
  html: ProposalTextDiffStats;
  css: ProposalTextDiffStats;
  payloadSchema: ProposalTextDiffStats;
  /** True when any pane differs — the "the design itself changed" signal, independent of render output. */
  changed: boolean;
}

/** The durable `TemplateProposal.checkSummary` roll-up. */
export interface ProposalCheckSummary {
  version: 1 | 2;
  /** "none" = the template's schema has zero valid datasets → no regression coverage. */
  coverage: "covered" | "none";
  /** Every rendered dataset is `pass` (and at least one ran) → the reviewer's fast-approve signal. */
  noOutputChange: boolean;
  totals: { datasets: number; pass: number; changed: number; error: number };
  /** Normalized policy used for the latest run. Present on v2 summaries. */
  regression?: ProposalRegressionPolicy;
  /** Durable named fixture evidence. Present on v2 summaries. */
  fixtures?: ProposalFixtureEvidence[];
  artifactDiff: ProposalArtifactDiff;
  datasets: ProposalDatasetCheck[];
  ranAt: string;
}

/** One append-only approve/reject decision on a proposal. */
export interface ProposalApproval {
  id: string;
  decision: string;
  note: string | null;
  approverUserId: string | null;
  createdAt: string;
}

/** The promote-gate snapshot returned with a proposal detail. */
export interface ProposalGate {
  active: boolean;
  requiredApprovals: number;
  distinctApprovers: number;
  openBlockingThreads: number;
  blockingPolicyActive: boolean;
  promotable: boolean;
  blockReason: string | null;
}

/** A template change proposal (the PR analog): a frozen candidate reviewed before it is promoted. */
export interface TemplateProposal {
  id: string;
  templateId: string;
  status: ProposalStatus;
  checkStatus: ProposalCheckStatus;
  baseVersion: number;
  note: string | null;
  editorMode: string;
  authorUserId: string | null;
  promotedVersion: number | null;
  checkSummary?: ProposalCheckSummary | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  /** Present on a detail fetch. */
  approvals?: ProposalApproval[];
  /** Present on a detail fetch. */
  gate?: ProposalGate;
}

/** Body of `POST /v1/templates/:id/proposals`. */
export interface OpenProposalParams {
  /** Freeze the template's current saved draft as the candidate (ignores inline html/css). */
  fromDraft?: boolean;
  /** Candidate template HTML (compiled Liquid). Required unless `fromDraft`. */
  html?: string;
  /** Candidate CSS. */
  css?: string;
  /** Example payload; used to infer the JSON Schema when `payloadSchema` is omitted. */
  payload?: Record<string, unknown>;
  /** The candidate payload JSON Schema. Inferred from `payload` when omitted. */
  payloadSchema?: Record<string, unknown>;
  /** Authoring mode of the candidate (default `code`). */
  editorMode?: "code" | "visual";
  /** Lossless re-editable restore source (visual mode). Omit for code mode. */
  editorSource?: Record<string, unknown>;
  /** Frozen Gotenberg render settings for the candidate version. */
  renderSettings?: Record<string, unknown>;
  /** A short "what changed" note shown in history at promote (max 200 chars). */
  note?: string;
}

export interface ListProposalsParams {
  status?: ProposalStatus;
  cursor?: string;
  limit?: number;
}

export interface ProposalPage {
  items: TemplateProposal[];
  nextCursor: string | null;
}

/** Body of the approve / reject endpoints. */
export interface ProposalDecisionParams {
  /** An optional note recorded with the decision (required on reject in the portal; max 1000 chars). */
  note?: string;
  /** Attribute the decision to a named approver on a review targeting this proposal. */
  approverUserId?: string;
}

/** Optional policy body for `POST /v1/templates/:id/proposals/:proposalId/checks`. */
export interface RunProposalChecksParams {
  /** Advisory allows changed output after review; strict blocks promotion when fixtures changed. */
  regressionMode?: ProposalRegressionMode;
  /** Observable regression signals to evaluate for each fixture. */
  checks?: ProposalRegressionCheckName[];
  /** Minimum successful fixture renders required before publish readiness passes. */
  minSuccessfulFixtures?: number;
  /** When false, fixture render/schema errors stay visible but do not block publish readiness. */
  failOnErrors?: boolean;
}

/** `POST …/promote` result. */
export interface PromoteProposalResult {
  promotedVersion: number;
}

// ── Environments & pins (Pillar 2) ──────────────────────────────────────────────

/** A named per-account pointer set over immutable template versions. */
export interface Environment {
  id: string;
  name: string;
  slug: string;
  isProduction: boolean;
  pinCount: number;
  createdAt: string;
}

/** One template → published-version pointer in an environment. */
export interface EnvironmentPin {
  templateId: string;
  version: number;
  updatedByUserId: string | null;
  deploymentId: string | null;
  updatedAt: string;
}

/** Body of `POST /v1/environments`. */
export interface CreateEnvironmentParams {
  name: string;
  /** Lowercase letters, digits, and single hyphens; the render-time selector, unique per account. */
  slug: string;
  isProduction?: boolean;
}

/** Body of `PATCH /v1/environments/:slug`. The slug is immutable. */
export interface UpdateEnvironmentParams {
  name?: string;
  isProduction?: boolean;
}

/** Body of `POST /v1/environments/:slug/promote`. */
export interface PromotePinsParams {
  /** Source environment slug to copy pins from. */
  from: string;
  /** Only promote these template ids. Omit to promote every pin in the source. */
  templates?: string[];
}

/** `POST …/promote` result: how many pins moved, the resulting pins, and the recorded deployment id. */
export interface PromotePinsResult {
  promoted: number;
  pins: EnvironmentPin[];
  /** The pin-only Deployment this promote recorded (null when nothing moved). */
  deploymentId?: string | null;
}

/** Body of `POST …/rollback`. */
export interface RollbackParams {
  /** Deployment id whose pin set to restore. Omit to roll back to the last successful deployment. */
  toDeploymentId?: string;
}

/** `POST …/rollback` result: the new deployment, the restored pins, and the rolled-back deployment id. */
export interface RollbackResult {
  deploymentId: string;
  restored: EnvironmentPin[];
  rolledBack: string;
}

// ── Deployments (Pillar 3, documents-as-code) ───────────────────────────────────

export type DeploymentStatus =
  | "planned"
  | "applying"
  | "succeeded"
  | "failed"
  | "rolled_back";
export type DeploymentSource = "cli" | "github" | "portal";
export type DeploymentAction = "create" | "update" | "delete" | "noop";
export type DeploymentResourceType =
  | "template"
  | "schema"
  | "environmentPin"
  | "webhook"
  | "schedule";

/** One Terraform-style change line in a deployment plan. */
export interface DeploymentChange {
  type: "template" | "schema" | "webhook" | "schedule";
  name: string;
  action: DeploymentAction;
  beforeHash: string | null;
  afterHash: string | null;
}

/** A non-fatal advisory attached to a plan (never a silent mutation). */
export interface DeploymentWarning {
  code: string;
  message: string;
  resource?: string;
}

/** The reviewable plan output persisted on a `planned` deployment. */
export interface DeploymentPlan {
  changes: DeploymentChange[];
  warnings: DeploymentWarning[];
}

/** A deployment as returned by plan/list. */
export interface Deployment {
  id: string;
  status: DeploymentStatus;
  /** The target environment slug, or null. */
  environment: string | null;
  source: DeploymentSource;
  sourceRef: string | null;
  /** The git commit the manifest was rendered at (null for a keyed ad-hoc plan). */
  commitSha: string | null;
  /** SHA-256 of the canonicalized manifest — the drift + idempotency handle. */
  manifestHash: string;
  plan: DeploymentPlan;
  createdAt: string;
}

/** One resource-level line of a deployment with its apply outcome. */
export interface DeploymentResource {
  resourceType: DeploymentResourceType;
  name: string;
  action: DeploymentAction;
  beforeHash: string | null;
  afterHash: string | null;
  /** "pending" | "applied" | "failed" | "skipped". */
  status: string;
  error: string | null;
}

/** A deployment with its per-resource plan lines (the `GET /v1/deployments/:id` shape). */
export interface DeploymentDetail extends Deployment {
  resources: DeploymentResource[];
}

/** Body of `POST /v1/deployments/plan`. */
export interface PlanDeploymentParams {
  /** Target environment slug the plan diffs against. */
  environment: string;
  /** The raw pageweaver.yml manifest text. */
  manifest: string;
  /** Manifest-relative path → UTF-8 contents for every file the manifest names. */
  files: Record<string, string>;
  /** The commit the manifest was rendered at (enables idempotent re-plan). */
  commitSha?: string;
  /** Branch/tag/workflow-run ref for provenance. */
  sourceRef?: string;
  /** Where the plan originated (provenance only). Defaults to "cli". */
  source?: DeploymentSource;
  /** Values for resolving `${NAME}` references in the manifest (e.g. a webhook URL secret). */
  env?: Record<string, string>;
}

/** Query params for `GET /v1/deployments`. */
export interface ListDeploymentsParams {
  /** Filter to one environment slug. */
  environment?: string;
  /** Max rows (1–200, default 50). */
  limit?: number;
}

// ── Smart Forms (Phase D, V2-D06) ────────────────────────────────────────────

/** A submission's lifecycle status (06 §6.1). Mirrors the API's SubmissionStatus enum. */
export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "validation_failed"
  | "pending_approval"
  | "approved"
  | "changes_requested"
  | "rendered"
  | "delivered"
  | "canceled";

/** A rule-emitted message (an `add_error` / `add_warning`), optionally attached to a field. */
export interface RuleMessage {
  field?: string | null;
  message: string;
}

/**
 * The evaluated rule state for a set of inputs (06 §2.7): which fields/sections are visible, required,
 * and enabled; computed values; narrowed option sets; included pages; and any rule errors/warnings. An
 * unlisted key means "the schema/layout default".
 */
export interface EvaluatedState {
  visible: Record<string, boolean>;
  required: Record<string, boolean>;
  enabled: Record<string, boolean>;
  values: Record<string, unknown>;
  options: Record<string, unknown>;
  pages: Record<string, boolean>;
  errors: RuleMessage[];
  warnings: RuleMessage[];
}

/** One rule's line in an execution trace (why it did/didn't fire). */
export interface RuleTraceEntry {
  key: string;
  branch: string;
  matched: boolean;
  applied: string[];
  skipped?: string;
}

/** The execution trace of a rule pass (06 §2.8): per-rule outcomes + timing. */
export interface RuleTrace {
  rules: RuleTraceEntry[];
  totalMs: number;
  aborted: boolean;
}

/** One field in a form's contract: its key, label, type, whether it's required, its step + widget. */
export interface FormFieldContract {
  name: string;
  label: string;
  type: string;
  required: boolean;
  step: string | null;
  widget: string | null;
}

/** A published form (the `GET /v1/forms` row). */
export interface Form {
  id: string;
  name: string;
  slug: string;
  currentVersion: number;
  templateId: string;
  templateVersion: number;
  schemaId: string;
  schemaVersion: number;
  /** SHA-256 of the frozen FormVersion (layout + rules + pins). */
  snapshotHash: string;
  publishedAt: string;
}

/**
 * The current version's frozen deployable source (`GET /v1/forms/:id?include=source`). The schema +
 * template are NAMED (not ids) so `pageweaver pull` re-synthesizes a manifest form file that `deploy`
 * plans as a noop. Layout + rules + tests are the full frozen artifact.
 */
export interface FormSource {
  schemaRef: string;
  templateRef: string;
  layout: unknown;
  rules: unknown;
  tests: unknown;
}

/** A form plus its machine-readable field contract (`GET /v1/forms/:id`). */
export interface FormDetail extends Form {
  fieldContract: {
    schemaId: string;
    schemaVersion: number;
    /** The pinned SchemaVersion's compiled JSON Schema (the payload contract). */
    schema: Record<string, unknown>;
    fields: FormFieldContract[];
  };
  /** Present only when requested with `include: "source"` — the deployable source for a manifest export. */
  source?: FormSource;
}

/** A published FormVersion (`GET /v1/forms/:id/versions` row). */
export interface FormVersion {
  version: number;
  snapshotHash: string;
  templateId: string;
  templateVersion: number;
  schemaId: string;
  schemaVersion: number;
  publishedAt: string;
}

/** Body of `POST /v1/forms/:id/validate` and `POST /v1/forms/:id/submissions`. */
export interface FormDataParams {
  /** The form field values (the shape a filler submits). Reserved `_form` is ignored. */
  data: Record<string, unknown>;
}

/** Result of the `POST /v1/forms/:id/validate` dry-run (unmetered). */
export interface ValidateFormResult {
  valid: boolean;
  validationResult: { valid: boolean; errors: string[] };
  evaluatedState: EvaluatedState | null;
  trace?: RuleTrace;
}

/** Result of `POST /v1/forms/:id/submissions` (the async 202 body). */
export interface CreateSubmissionResult {
  id: string;
  status: SubmissionStatus | string;
}

/** A submission's status + document linkage (`GET /v1/submissions/:id`). */
export interface Submission {
  id: string;
  formId: string | null;
  formVersion: number;
  status: SubmissionStatus | string;
  /** SHA-256 of the canonicalized submitted data. */
  dataHash: string;
  /** The linked document (RenderJob) id once accepted for render; null otherwise. */
  renderJobId: string | null;
  /** Validation messages when the submission landed `validation_failed`; null otherwise. */
  validationResult: Record<string, unknown> | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
