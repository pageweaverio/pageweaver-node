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
  /**
   * Base text direction. `"auto"` (the default) follows the locale, so an Arabic or Hebrew locale
   * produces a right-to-left document with nothing else set. Use `"ltr"`/`"rtl"` only to override.
   */
  direction?: "auto" | "ltr" | "rtl";
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
/**
 * Email a finished document to end recipients, under `options.delivery.email` (E14).
 *
 * Every string field is Liquid over THIS document's payload, so one template reaches a different
 * person per document: `to: ["{{ customer.email }}"]` over a 500-row bulk run mails 500 customers.
 * An expression that resolves to nothing is skipped rather than failing the document.
 *
 * This REPLACES the template's email-delivery setting for this render; it is not merged into it.
 * Requires a plan with email delivery, and recipients are subject to your workspace's allowed
 * domains, the per-document recipient cap, and your monthly send budget. Anything a rule rejects is
 * recorded on the document rather than silently dropped.
 */
export interface EmailDeliveryOptions {
  /** Recipient addresses or Liquid expressions. Required. */
  to: string[];
  cc?: string[];
  bcc?: string[];
  /** Liquid subject line. Defaults to a generic subject. */
  subject?: string;
  /** Liquid plain-text body. In "link" mode, `{{ _document.url }}` resolves to the download link. */
  body?: string;
  /**
   * "attach" sends the document as an attachment; "link" sends a short-lived download link instead.
   * Defaults to "attach". A download-protected document is always sent as a link.
   */
  mode?: "attach" | "link";
  /** Liquid attachment filename. The correct extension is added automatically. */
  attachmentName?: string;
}

export interface DeliveryOptions {
  mode?: "all" | "none" | "selected";
  destinationIds?: string[];
  /** Email this document to end recipients (E14). */
  email?: EmailDeliveryOptions;
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
 * Archival PDF/A conformance level. Only b-level conformance is offered, and `"1b"` is deliberately
 * absent: the conversion cannot produce a PDF/A-1b that passes validation, so it is not offered
 * rather than offered and failing. Use `"3b"` when the document may later carry an embedded
 * machine-readable payload.
 */
export type PdfaLevel = "2b" | "3b";

// ─── EN 16931 e-invoice (Factur-X) ──────────────────────────────────────────────
//
// The canonical invoice you pass as `output.invoice` for an inline `facturx` render. Field names map
// 1:1 to EN 16931 business terms (BT-*) and groups (BG-*), so this is the "core invoice" the API maps
// to CII XML and embeds in the PDF/A-3. Monetary amounts are plain numbers in the document currency's
// major unit (e.g. euros, not cents); you supply prices and quantities, never the totals — every
// rounding-sensitive total is computed from the lines server-side.

/**
 * EN 16931 VAT category code (a subset of UNCL5305) — BT-151 on a line.
 *  - `S`  Standard rate  ·  `Z`  Zero rated  ·  `E`  Exempt
 *  - `AE` Reverse charge  ·  `K`  Intra-community supply  ·  `G`  Free export
 *  - `O`  Outside scope  ·  `L`  Canary Islands IGIC  ·  `M`  Ceuta/Melilla IPSI
 *
 * The categories that mean "no VAT charged" (`Z`, `E`, `AE`, `K`, `G`, `O`) require a `vatRate` of 0,
 * and several (`E`, `AE`, `K`, `G`, `O`) require an {@link EInvoice.exemptionReasons} entry.
 */
export type VatCategoryCode = "S" | "Z" | "E" | "AE" | "K" | "G" | "O" | "L" | "M";

/** BG-5 (seller) / BG-8 (buyer) — a postal address. */
export interface InvoiceAddress {
  /** BT-35 / BT-50 — address line 1 (street). */
  line1?: string;
  /** BT-36 / BT-51 — address line 2. */
  line2?: string;
  /** BT-37 / BT-52 — city. */
  city?: string;
  /** BT-38 / BT-53 — post code. */
  postalZone?: string;
  /** BT-39 / BT-54 — country subdivision (state / province / county). */
  subdivision?: string;
  /** BT-40 / BT-55 — country code, ISO 3166-1 alpha-2 (e.g. `DE`). **Required** by EN 16931. */
  countryCode: string;
}

/** BG-4 (seller) / BG-7 (buyer) — a trading party. */
export interface InvoiceParty {
  /** BT-27 (seller) / BT-44 (buyer) — the registered legal name. **Required.** */
  name: string;
  /** BT-28 (seller) / BT-45 (buyer) — a trading name, if different from the legal name. */
  tradingName?: string;
  /** BT-31 (seller) / BT-48 (buyer) — the VAT identifier, including the country prefix (e.g. `DE123456789`). */
  vatId?: string;
  /** BT-30 (seller) / BT-47 (buyer) — a legal registration id (company number). */
  legalRegistrationId?: string;
  /** BT-34 (seller) / BT-49 (buyer) — an electronic address (e.g. a Peppol endpoint). */
  electronicAddress?: { value: string; schemeId?: string };
  address: InvoiceAddress;
}

/** BG-25 — one invoice line. Derived amounts (line totals, VAT) are computed, never supplied. */
export interface InvoiceLine {
  /** BT-126 — the line identifier. Omit to let the server assign a 1-based sequence. */
  id?: string;
  /** BT-153 — the item name. **Required.** */
  name: string;
  /** BT-154 — an item description. */
  description?: string;
  /** BT-129 — the invoiced quantity. **Required.** */
  quantity: number;
  /** BT-130 — the unit of measure, a UN/ECE Rec 20 code (default `C62`, "one/piece"). */
  unitCode?: string;
  /** BT-146 — the net price of one unit (after any item discount), in the document currency. **Required.** */
  netPrice: number;
  /** BT-149 — the base quantity the net price applies to (default 1). */
  baseQuantity?: number;
  /** BT-151 — the line's VAT category code. **Required.** */
  vatCategory: VatCategoryCode;
  /** BT-152 — the line's VAT rate as a percentage, e.g. `19`. **Required** (0 for zero/exempt). */
  vatRate: number;
}

/** BG-16 — payment terms, and optionally a single credit-transfer account (BG-17). */
export interface InvoicePayment {
  /** BT-20 — free-text payment terms. */
  terms?: string;
  /** BT-83 — a remittance / payment reference the payer should quote. */
  reference?: string;
  /** BG-17 — a credit-transfer IBAN the payment is due to. */
  iban?: string;
  /** BT-85 — the name of the payment account holder. */
  accountName?: string;
}

/**
 * A canonical EN 16931 invoice, passed as {@link DocumentOutput.invoice} for an inline `facturx` render.
 * You never supply the totals — the server derives every rounding-sensitive amount from the lines.
 */
export interface EInvoice {
  /** BT-1 — the invoice number. **Required**, unique per seller. */
  invoiceNumber: string;
  /** BT-2 — the issue date, ISO `YYYY-MM-DD`. **Required.** */
  issueDate: string;
  /** BT-9 — the payment due date, ISO `YYYY-MM-DD`. */
  dueDate?: string;
  /** BT-3 — the invoice type code (UNCL1001); default `380` (commercial invoice), `381` = credit note. */
  typeCode?: string;
  /** BT-5 — the document currency, ISO 4217 (e.g. `EUR`). **Required.** */
  currency: string;
  /** BT-10 — a buyer reference (often a purchase-order or cost-center key the buyer requires). */
  buyerReference?: string;
  /** BT-13 — the purchase order number this invoice relates to. */
  purchaseOrderReference?: string;
  /** BT-22 — a free-text note on the document. */
  note?: string;
  /** BG-4 — the seller. **Required.** */
  seller: InvoiceParty;
  /** BG-7 — the buyer. **Required.** */
  buyer: InvoiceParty;
  /** BG-25 — the invoice lines. **Required**, at least one. */
  lines: InvoiceLine[];
  /** BG-16 — payment details. */
  payment?: InvoicePayment;
  /**
   * BT-96/BT-97/BT-121 — a VAT exemption reason keyed by category code, required by EN 16931 for the
   * "no VAT" categories (`E`, `AE`, `K`, `G`, `O`). Applied to every breakdown group of that category.
   */
  exemptionReasons?: Partial<Record<VatCategoryCode, string>>;
  /** The customization identifier. Defaults to plain EN 16931; usually leave it unset for Factur-X. */
  customizationId?: string;
  /** The profile identifier. Defaults to none; usually leave it unset for Factur-X. */
  profileId?: string;
}

/**
 * What a document request produces: a raster image instead of a PDF, a Factur-X e-invoice, and/or
 * archival PDF/A conformance.
 *
 * **Image**: with only `width`, the image height grows proportionally to fit the page; add `height`
 * + `clip` for an exact crop. `quality` is jpeg/webp compression; `transparent` gives a transparent
 * background (png/webp).
 *
 * **PDF/A**: see {@link DocumentOutput.pdfa} for what the conversion changes. It is not free, and
 * two of its effects are invisible in the produced document.
 */
export interface DocumentOutput {
  /**
   * `"pdf"` (default), a raster image format, `"facturx"`, or `"ubl"`.
   *
   * `"facturx"` returns a Factur-X / ZUGFeRD file: a PDF/A-3 with the EN 16931 e-invoice (CII) embedded,
   * so one file is both the human-readable PDF and the machine-readable invoice. It needs a template or
   * inline render (not a `url`), is always PDF/A-3b, and cannot be signed or encrypted.
   *
   * `"ubl"` returns a **standalone** EN 16931 UBL 2.1 invoice as pure XML (no PDF), for buyers who ingest
   * the structured invoice directly. It also needs a template or inline render (not a `url`), and because
   * it produces no PDF it cannot carry PDF/A, a digital signature, or a PDF open-password. Set
   * {@link EInvoice.customizationId} / {@link EInvoice.profileId} on the invoice to tag it as Peppol BIS
   * Billing 3.0.
   *
   * For both structured formats the invoice comes from the template version's e-invoice binding, or from
   * an explicit {@link DocumentOutput.invoice} for an inline / one-off render (required when there is no
   * binding).
   */
  format?: "pdf" | "facturx" | "ubl" | "png" | "jpeg" | "webp";
  /**
   * Structured e-invoice data for a `facturx` or `ubl` render, as a canonical {@link EInvoice} object.
   * Use it for an inline / one-off render that has no template binding, or to override the version's
   * binding. It is validated against EN 16931 (a plausible-but-invalid invoice is rejected). Ignored
   * unless `format` is `"facturx"` or `"ubl"`. You never supply the totals: they are computed from the
   * lines.
   */
  invoice?: EInvoice;
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
  /**
   * Produce an archival **PDF/A** document. `"none"` opts out of a template that defaults to
   * archival output.
   *
   * Three things change, and two of them are invisible in the produced document:
   * - **Link annotations do not survive.** Link text still looks like a link but does nothing.
   * - **Text set with OpenType feature substitution stops being extractable** (most commonly
   *   `font-variant-numeric: tabular-nums`). It looks identical but cannot be selected, searched, or
   *   copied. So a PDF/A document is **not** a machine-readability guarantee.
   * - **The `Author` metadata field is dropped**, because PDF/A cannot record it conformantly. The
   *   API reports this in `outputNotices` on the document.
   *
   * Adds roughly 200ms plus 25ms per page. Works together with a digital signature. Cannot be
   * combined with an image `format`, a PDF open-password, or a `url` render (each returns a 400).
   */
  pdfa?: PdfaLevel | "none";
  /**
   * Produce an **accessible PDF/UA-1** document: tagged, with a reading order, table headers, and
   * described images, validated against the standard by the veraPDF reference validator before it is
   * issued. `"none"` opts out of a template that defaults to accessible output.
   *
   * Conformance depends on your MARKUP, not only on asking for it. Every image needs alt text (an
   * empty `alt` is not accepted), inline SVG needs `role="img"` + `aria-label`, headings must not skip
   * levels, tables need `<th>` cells, and the document needs a language and a title. What is
   * mechanical (the role map, link descriptions, the document language, and marking running headers
   * and footers as artifacts) is handled for you.
   *
   * Works together with a digital signature: the conformance check runs on the SIGNED document, so
   * the verdict covers the file you receive. Cannot be combined with a watermark, a PDF
   * open-password, PDF/A, an image `format`, or a `url` render (each returns a 400).
   */
  pdfUa?: "1" | "none";
  /**
   * What happens when an accessible document does not conform. `"require"` (the default) fails the
   * document and names the rules it broke, so a document you receive has always been checked.
   * `"attempt"` returns it anyway with the violations listed, which is what you want while adjusting a
   * template. Only meaningful with {@link DocumentOutput.pdfUa}.
   */
  conformance?: "require" | "attempt";
}


interface CreateDocumentCommon {
  /** Data merged into the template/HTML via Liquid. */
  payload?: Record<string, unknown>;
  /** Per-render option overrides, nested under this one key. */
  options?: RenderOptions;
  /**
   * What this call produces: a raster image instead of a PDF (template + inline renders only),
   * and/or archival PDF/A conformance.
   */
  output?: DocumentOutput;
  /**
   * A unique token you generate per document so a retried request returns the original
   * document instead of creating a duplicate. Sent as the `Idempotency-Key` header.
   */
  idempotencyKey?: string;
  /** HTTPS URL to receive a signed webhook POST when the document reaches a terminal state. */
  callbackUrl?: string;
  /**
   * A human name for the document, shown wherever it is listed. Useful when the document will gain
   * further versions via {@link DocumentsResource.appendVersion}, so the series is recognizable rather
   * than an id.
   */
  name?: string;
  /**
   * Mint a permanent public link for this document at `/d/{alias}`. The link always resolves to the
   * newest version; append `@n` to pin one. Anyone holding the link can read the document — the token
   * IS the access control: it is returned once, on the create response, and never listed again.
   */
  publicAlias?: boolean;
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
  /**
   * The public capability link minted for this document, present only when `publicAlias: true` was
   * requested. The `token` IS the access control for `/d/{alias}` (no other credential gates it), so
   * it is returned ONLY on this response — never listed again. Reissue under the same link with
   * {@link DocumentsResource.appendVersion}.
   */
  alias?: { token: string; enabled: boolean };
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

/** Accessibility conformance for a document, and the `GET /v1/documents/:id/accessibility` body. */
export interface DocumentAccessibility {
  /** The standard claimed, e.g. "PDF/UA-1". */
  standard: string;
  /** The validator's verdict on this document; null while it is still rendering. */
  conformant: boolean | null;
  /** How a non-conformant result was handled: "require" or "attempt". */
  mode?: string;
  /** The validator that gave the verdict, e.g. "veraPDF 1.30.2". */
  validator?: string;
  /** Every rule violation, with the ISO clause or the authoring mistake behind it. */
  violations?: AccessibilityViolation[];
  /** What the pipeline adjusted to make the document conformant. */
  remediation?: string[];
  /** ISO-8601 time the verdict was recorded. */
  checkedAt?: string;
  /** Whether the stored report is still retrievable (it follows the document's retention). */
  reportAvailable?: boolean;
}

/** One accessibility problem: an authoring mistake, or a rule the validator failed. */
export interface AccessibilityViolation {
  /** Where it was found: "preflight" (your HTML) or "validator" (the produced PDF). */
  source: string;
  /** Stable machine id, e.g. `image-missing-alt` or `ISO 14289-1:7.3-1`. */
  rule: string;
  /** What is wrong, addressed to whoever can fix it. */
  message: string;
  /** How many times it occurs. */
  count: number;
  /** The offending markup, trimmed. Preflight findings only. */
  snippet?: string;
  /** ISO 14289-1 clause and test number. Validator findings only. */
  clause?: string;
}

/** The `GET /v1/documents/:id` body. */
export interface Document {
  id: string;
  status: DocumentStatus;
  version: number | null;
  /** The output format this document produces: "pdf" (default), "facturx", "ubl", "png", "jpeg", or "webp". */
  outputFormat: string;
  /**
   * The archival conformance level this document was issued at, or null for a plain PDF. Set whether
   * the level came from this call's `output.pdfa` or from the template's own default.
   */
  pdfa?: PdfaLevel | null;
  /**
   * Accessible conformance, present when the document was issued as PDF/UA. `conformant` is the
   * reference validator's verdict on THIS document (null while it is still rendering), because
   * conformance is decided by the template's markup and not only by asking for it. Fetch the full
   * report, with every failed rule and its ISO 14289-1 clause, from
   * `GET /v1/documents/:id/accessibility`.
   */
  accessibility?: DocumentAccessibility | null;
  /**
   * What had to change to honor the request. Two kinds of entry appear: the `Author` metadata field
   * being dropped, which a PDF/A document cannot carry conformantly; and, for a structured e-invoice
   * output (`facturx` / `ubl`), a template's frozen signing / open-password / PDF-A default that the
   * chosen format cannot carry being skipped rather than applied (a facturx file is a PDF/A-3 that is
   * not signed or encrypted; a ubl document is XML). Absent when nothing was adjusted. An *explicit*
   * per-render request for an incompatible option is still a 400, not a notice.
   */
  outputNotices?: string[];
  download?: DownloadInfo;
  /** Present when `status` is "failed". */
  error?: string;
  /** The per-render options the document was created with; null if none. */
  appliedOptions?: Record<string, unknown> | null;
  /** Content fingerprint + chain position; null until the document has finished rendering. */
  integrity?: DocumentIntegrity | null;
  /** Review activity (thread counts, active review, approval tally); null when untouched by reviews. */
  review?: DocumentReviewSummary | null;
  /**
   * Per-attempt failure history, most recent first. Present only when the document has failed attempts
   * (a clean render omits it) — the "why did this fail, and can I retry it" view.
   */
  attempts?: RenderAttempt[];
}

/** One failed render attempt in a document's failure history. */
export interface RenderAttempt {
  /** 1-based attempt number. */
  attempt: number;
  /** The pipeline stage it failed at: source | render | gate | pdfa | sign | einvoice | storage | unknown. */
  stage: string;
  /** Error classification: timeout | gotenberg | validation | conversion | signing | limit | storage | internal | unknown. */
  classification: string;
  /** Whether this class of failure is typically transient (a retry might succeed). */
  retryable: boolean;
  /** Sanitized failure message. */
  error: string;
  /** Attempt wall-clock in ms, when derivable. */
  durationMs: number | null;
  /** ISO 8601 time the attempt failed. */
  failedAt: string;
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
  /** Output format: "pdf" | "facturx" | "ubl" | "png" | "jpeg" | "webp". */
  outputFormat: string;
  pages: number | null;
  bytes: number | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  finishedAt: string | null;
  contentAvailable: boolean;
  contentExpiresAt: string | null;
  error: string | null;
  /**
   * Latest WEBHOOK delivery outcome (D67): "delivered" | "failed" | "skipped" | "pending", or null when
   * this document was never subscribed to a webhook. Use for per-item delivery reconciliation.
   */
  delivery: string | null;
  /** ISO 8601 time the webhook delivery outcome was recorded; null if never subscribed (E11). */
  deliveredAt: string | null;
  /**
   * Latest direct-to-storage (BYOS) delivery outcome (D96/E11): "delivered" | "failed" | "skipped" |
   * "pending", or null when no storage destination applied. Reconcile independently of `delivery`.
   */
  storageDelivery: string | null;
  /** ISO 8601 time the storage delivery outcome was recorded; null if none applied (E11). */
  storageDeliveredAt: string | null;
  /** Short-lived signed download URL — present only when `include: "url"` was passed and the PDF is retained. */
  url?: string;
}

export interface ListDocumentsParams {
  status?: DocumentStatus;
  templateId?: string;
  /** Scope the list to one bulk run's items, for per-item delivery reconciliation (E11). */
  batchId?: string;
  /** ISO 8601 lower/upper bounds on creation time. */
  createdAfter?: string;
  createdBefore?: string;
  /**
   * Reconcile the WEBHOOK channel: "undelivered" (subscribed but never delivered), "failed",
   * "delivered", "pending", "skipped", or "none" (no webhook).
   */
  delivery?: string;
  /** Reconcile the direct-to-storage (BYOS) channel — same values as `delivery` (E11). */
  storageDelivery?: string;
  /** Pass "url" to attach a short-lived signed download URL to each finished, retained document. */
  include?: string;
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

// ── Document lineage: trust, diff, versions, representations ───────────────────
// Supersedes the retired `/v1/living-documents/*` surface (folded into these `/v1/documents/:id/*`
// routes). A document created from a template can grow a version lineage via `appendVersion`; each
// version can carry multiple artifacts ("representations": the PDF, an e-invoice XML sidecar, a JSON
// data twin, ...).

/** `GET /v1/documents/:id/trust` — a single deterministic, agent-facing integrity + provenance summary. */
export interface DocumentTrustManifest {
  documentId: string;
  status: DocumentStatus;
  schemaId: string | null;
  schemaVersion: number | null;
  /** Null for an inline or `url` render (no template). */
  templateId: string | null;
  version: number | null;
  artifactHash: string | null;
  contentHash: string | null;
  hashAlg: string | null;
  chainSeq: number | null;
  chainVerified: boolean | null;
  signature: DocumentSignature | null;
}

/** One field-level change in a {@link DocumentDiffResult}. */
export interface PayloadChange {
  path: string;
  before: unknown;
  after: unknown;
}

/** How two documents' causal history relates, from `GET /v1/documents/:id/diff`. */
export type DocumentDiffClassification =
  | "payload_only"
  | "template_only"
  | "both_changed"
  | "options_differ"
  | "identical"
  | `not_comparable_${string}`;

/** `GET /v1/documents/:id/diff?against=` — a causal diff between two documents. Never renders or meters. */
export interface DocumentDiffResult {
  a: { documentId: string; status: DocumentStatus };
  b: { documentId: string; status: DocumentStatus };
  classification: DocumentDiffClassification;
  payload: { comparable: boolean; changes: PayloadChange[] };
  template: {
    comparable: boolean;
    changed: boolean;
    templateIdA: string | null;
    templateIdB: string | null;
    versionA: number | null;
    versionB: number | null;
  };
  optionsDelta: PayloadChange[];
  pageDelta: number | null;
  integrity: { contentHashA: string | null; contentHashB: string | null; identical: boolean };
}

/** Body of `POST /v1/documents/:id/versions` ({@link DocumentsResource.appendVersion}). */
export interface AppendDocumentVersionParams {
  /** Data merged into the SAME pinned template/schema this document's lineage started from. */
  payload: Record<string, unknown>;
}

/** Result of `POST /v1/documents/:id/versions`: the lineage id plus the new version's queued document. */
export interface AppendDocumentVersionResult {
  documentId: string;
  document: { id: string; status: DocumentStatus };
}

/** One immutable version in a document's lineage (`GET /v1/documents/:id/versions` row). */
export interface DocumentVersionInfo {
  /** 1-based, gap-free. */
  seq: number;
  /** The id to `documents.get()` this version by; null if the underlying render row was erased. */
  documentId: string | null;
  /** "generated" (rendered), "uploaded" (intake), or "imported". */
  origin: string;
  status: DocumentStatus | string;
  reason: string | null;
  contentHash: string | null;
  chainSeq: number | null;
  representationCount: number;
  readyCount: number;
  /** The seq that superseded this version, or null while it is the head. */
  supersededBySeq: number | null;
  createdAt: string;
  issuedAt: string | null;
}

/** `GET /v1/documents/:id/versions` — a document's full lineage, newest first. */
export interface DocumentVersionList {
  documentId: string;
  versions: DocumentVersionInfo[];
}

/** One artifact of a document version (`GET /v1/documents/:id/representations` row). */
export interface RepresentationInfo {
  id: string;
  /** e.g. "pdf", "cii", "ubl", "json". */
  format: string;
  /** e.g. "3b" for PDF/A-3b; null when not applicable. */
  profile: string | null;
  role: "primary" | "sidecar" | "attachment" | "preview" | string;
  status: string;
  mediaType: string;
  /** Null when this format has no page model (not the same as zero). */
  pages: number | null;
  bytes: number | null;
  contentHash: string | null;
  hashAlg: string | null;
  chainSeq: number | null;
  downloadProtected: boolean;
  /** False once purged (a tombstone row past retention). */
  contentAvailable: boolean;
  contentExpiresAt: string | null;
  /** A short-lived signed download URL, present only when `contentAvailable && !downloadProtected`. */
  url?: string;
  conformance: { standard: string; profile: string | null; status: string; validator: string | null }[];
  createdAt: string;
}

/** `GET /v1/documents/:id/representations` — every artifact of one document version. */
export interface RepresentationList {
  documentId: string;
  /** Null if no version has been issued yet. */
  documentVersion: number | null;
  representations: RepresentationInfo[];
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
  /**
   * The message this reply answers, nesting it under that message. Omit for a reply at the top
   * level of the thread. The message must belong to this thread.
   */
  parentMessageId?: string;
}

export interface CommentMessage {
  id: string;
  body: string;
  mentions: unknown;
  authorUserId: string | null;
  externalAuthorName: string | null;
  /** The message this answers. Null for a message at the top level of the thread. */
  parentMessageId: string | null;
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
  /**
   * Continuous drift status (E12): "drifted" (OutOfSync) when the live pins diverged from what the last
   * deployment established (an out-of-band change), "in_sync" (Synced) when they match, or "unknown"
   * before the environment has a deployment baseline. Recomputed by a background reconciler, so it
   * reflects a manual pin change with no CLI run.
   */
  driftStatus: "in_sync" | "drifted" | "unknown";
  /** When the reconciler last evaluated this environment (ISO 8601); null before its first pass. */
  driftCheckedAt: string | null;
  /** Per-template drift detail (present once drift has been computed). */
  driftDetail: {
    driftedCount: number;
    resources: {
      templateId: string;
      desiredVersion: number | null;
      actualVersion: number | null;
      state: "in_sync" | "changed" | "added" | "removed";
    }[];
  } | null;
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
  /**
   * The repository the manifest came from, as `owner/name` (provenance only). The CLI fills this
   * from `GITHUB_REPOSITORY` or its `--git-repo` flag, so the portal links a deployment's commit to
   * the repo that produced it instead of guessing from the account's Git connections.
   */
  gitRepo?: string;
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

// ─── Generic cursor page ──────────────────────────────────────────────────────

/** The generic cursor-paginated shape used by every object-model / meta list endpoint. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

// ── Object types (typed business-record definitions) — requires `objects:read` / `object-types:manage` ──

export type ObjectTypeStatus = "draft" | "published" | "deprecated";

/** Per-role visibility narrowing for a whole object type; each list narrows an implicit "everyone" default. */
export interface ObjectTypeAccessPolicy {
  view?: string[];
  write?: string[];
  viewSensitive?: string[];
  apiAccess?: boolean;
}

/**
 * A dotted-path field policy overlay, e.g. `{ "customer.ssn": { sensitive: true } }`. Mirrors the
 * `x-pw-*` JSON Schema annotation vocabulary: `sensitive`, `title`, `listable`, `searchable`,
 * `classification`, `permission`, `immutable`.
 */
export interface FieldPolicyOverlay {
  sensitive?: boolean;
  title?: string;
  listable?: boolean;
  searchable?: boolean;
  classification?: "public" | "internal" | "confidential" | "restricted";
  permission?: string;
  immutable?: boolean;
}

/** `GET /v1/object-types` row. */
export interface ObjectTypeView {
  id: string;
  key: string;
  nameSingular: string;
  namePlural: string;
  description: string | null;
  status: ObjectTypeStatus;
  currentVersion: number;
  hasUnpublishedChanges: boolean;
  accessPolicy: ObjectTypeAccessPolicy | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /v1/object-types/:id` — the view plus the DRAFT artifact (unpublished working copy). */
export interface ObjectTypeDetailView extends ObjectTypeView {
  schema: unknown;
  uiSchema: unknown;
  policyOverlay: unknown;
  lifecycle: unknown;
  search: unknown;
}

/** Body of `POST /v1/object-types` and `PATCH /v1/object-types/:id` (all fields optional on update). */
export interface ObjectTypeDraftParams {
  /** `POST` only, immutable after create: `/^[a-z][a-z0-9_]{0,62}$/`. */
  key?: string;
  nameSingular?: string;
  namePlural?: string;
  description?: string;
  /** JSON Schema, optionally annotated with `x-pw-*` field policy hints. */
  schema?: Record<string, unknown>;
  /** Presentation only; excluded from the published snapshot hash. */
  uiSchema?: Record<string, unknown>;
  policyOverlay?: Record<string, FieldPolicyOverlay>;
  lifecycle?: Record<string, unknown>;
  search?: Record<string, unknown>;
  accessPolicy?: ObjectTypeAccessPolicy;
}

/** `POST /v1/object-types` body — `key`/`nameSingular`/`namePlural` are required on create. */
export interface CreateObjectTypeParams extends ObjectTypeDraftParams {
  key: string;
  nameSingular: string;
  namePlural: string;
}

export interface ObjectTypeVersionSummary {
  id: string;
  version: number;
  snapshotHash: string;
  nameSingular: string;
  namePlural: string;
  description: string | null;
  note: string | null;
  derivedFromVersion: number | null;
  publishedByUserId: string | null;
  publishedAt: string;
  isCurrent: boolean;
}

export interface CompiledFieldPolicies {
  fields: Record<string, FieldPolicyOverlay>;
  sensitivePaths: string[];
}

export interface ObjectTypeVersionDetail extends ObjectTypeVersionSummary {
  schema: unknown;
  uiSchema: unknown;
  fieldPolicies: CompiledFieldPolicies;
  lifecycle: unknown;
  search: unknown;
}

/** Body of `POST /v1/object-types/:id/publish`. */
export interface PublishObjectTypeParams {
  note?: string;
}

/** `POST /v1/object-types/:id/publish` result. `unchanged: true` means the draft matched the current version (no new version minted). */
export interface PublishedObjectTypeView {
  objectTypeId: string;
  version: number;
  snapshotHash: string;
  unchanged: boolean;
  policies: CompiledFieldPolicies;
}

/** Body of `POST /v1/object-types/:id/deprecate`. */
export interface DeprecateObjectTypeParams {
  reason: string;
}

/** Query params for `GET /v1/object-types` and the paginated versions/objects/relationship-types lists. */
export interface CursorListParams {
  cursor?: string;
  /** 1 to 100, default 25. */
  limit?: number;
}

export interface ListObjectTypesParams extends CursorListParams {
  status?: ObjectTypeStatus;
}

// ── Objects (typed business records) — requires `objects:read` / `objects:write` / `relationships:manage` ──

export type BusinessObjectStatus = "active" | "archived";
export type ObjectClassification = "public" | "internal" | "confidential" | "restricted";

/** `GET /v1/objects` row — never carries field data (fetch `objects.get(id)` for that). */
export interface BusinessObjectView {
  id: string;
  objectTypeId: string;
  number: string;
  title: string | null;
  lifecycleState: string | null;
  status: BusinessObjectStatus;
  classification: ObjectClassification;
  ownerUserId: string | null;
  version: number;
  dataHash: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /v1/objects/:id` — the view plus its field data. */
export interface BusinessObjectValueView extends BusinessObjectView {
  data: unknown;
  /** Sensitive field paths this type declares that were withheld from `data` (reflects the TYPE's policy, not this record). */
  withheldPaths: string[];
  /** Whether `includeSensitive` was honored (requires `objects:read-sensitive`). */
  sensitiveIncluded: boolean;
  /** True when sensitive data was requested but is unavailable (e.g. decryption failure), not merely withheld. */
  sensitiveUnavailable: boolean;
}

/** Query params for `GET /v1/objects`. */
export interface ListObjectsParams extends CursorListParams {
  objectTypeKey?: string;
  objectTypeId?: string;
  status?: BusinessObjectStatus;
  lifecycleState?: string;
  ownerUserId?: string;
  number?: string;
}

/**
 * Body of `POST /v1/objects`. Provide exactly one of `objectTypeKey`/`objectTypeId`. `idempotencyKey`
 * is sent as the `Idempotency-Key` header when provided (the header wins if you also set one directly
 * via a signal-less call); an exact repeat returns the original record, the same key with a different
 * body is a 409.
 */
export interface CreateObjectParams {
  objectTypeKey?: string;
  objectTypeId?: string;
  data: Record<string, unknown>;
  /** Caller-supplied import number. Does not advance the account's generated sequence. */
  number?: string;
  lifecycleState?: string;
  ownerUserId?: string;
  /** May only tighten relative to the type's default. */
  classification?: ObjectClassification;
  changeReason?: string;
  source?: string;
  idempotencyKey?: string;
}

/**
 * Body of `PUT /v1/objects/:id`. Exactly one of `expectedVersion` or an `If-Match` header (sent
 * automatically when you pass `expectedVersion` — see {@link ObjectsResource.replace}) is required by
 * the API; a mismatch is a 409, never a silent overwrite. `data` REPLACES the record whole, it is not
 * merged.
 */
export interface ReplaceObjectParams {
  data: Record<string, unknown>;
  expectedVersion: number;
  lifecycleState?: string;
  ownerUserId?: string;
  classification?: ObjectClassification;
  changeReason?: string;
  source?: string;
}

/** `GET /v1/objects/:id/versions` row — never carries values (read one via `objects.get(id, { version })`). */
export interface BusinessObjectVersionSummary {
  id: string;
  version: number;
  objectTypeVersion: number;
  dataHash: string;
  title: string | null;
  lifecycleState: string | null;
  changeReason: string | null;
  actorType: string;
  actorId: string;
  source: string | null;
  hasSensitiveData: boolean;
  createdAt: string;
}

/** Body of `POST /v1/objects/:id/archive`. */
export interface ArchiveObjectParams {
  reason: string;
}

export type RelationshipCardinality = "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
export type RelationshipTypeStatus = "active" | "deprecated";

/** `GET /v1/relationship-types` row. */
export interface RelationshipTypeView {
  id: string;
  key: string;
  label: string;
  inverseLabel: string;
  description: string | null;
  sourceTypeKeys: string[];
  targetTypeKeys: string[];
  cardinality: RelationshipCardinality;
  status: RelationshipTypeStatus;
  createdAt: string;
  updatedAt: string;
}

/** Body of `POST /v1/relationship-types`. */
export interface CreateRelationshipTypeParams {
  /** `/^[a-z][a-z0-9_]{0,62}$/`. */
  key: string;
  /** Source → target reading, e.g. "invoices". */
  label: string;
  /** Target → source reading, e.g. "invoiced by". */
  inverseLabel: string;
  description?: string;
  /** Object-type keys allowed at the source end. Empty/omitted means any type. */
  sourceTypeKeys?: string[];
  /** Object-type keys allowed at the target end. Empty/omitted means any type. */
  targetTypeKeys?: string[];
  /** Default `"many_to_many"`. */
  cardinality?: RelationshipCardinality;
  /** JSON Schema each edge's `metadata` is validated against. */
  metadataSchema?: Record<string, unknown>;
}

/** Body of `PATCH /v1/relationship-types/:id`. Changes govern only edges created after the update. */
export interface UpdateRelationshipTypeParams {
  label?: string;
  inverseLabel?: string;
  description?: string;
  sourceTypeKeys?: string[];
  targetTypeKeys?: string[];
  cardinality?: RelationshipCardinality;
  metadataSchema?: Record<string, unknown>;
}

/** Body of `POST /v1/relationship-types/:id/deprecate`. */
export interface DeprecateRelationshipTypeParams {
  reason: string;
}

/** `GET /v1/objects/:id/relationships` row — one edge, from either end. */
export interface ObjectRelationshipEdge {
  id: string;
  relationshipTypeId: string;
  relationshipTypeKey: string;
  label: string;
  inverseLabel: string;
  sourceObjectId: string;
  targetObjectId: string;
  metadata: unknown;
  validFrom: string;
  validTo: string | null;
  endReason: string | null;
  direction: "outgoing" | "incoming";
  relatedObjectId: string;
}

/** Body of `POST /v1/objects/:id/relationships` — `:id` is the source; provide one of the type fields. */
export interface CreateRelationshipParams {
  relationshipTypeKey?: string;
  relationshipTypeId?: string;
  targetObjectId: string;
  /** Validated against the relationship type's `metadataSchema` when declared. */
  metadata?: Record<string, unknown>;
}

/** `POST /v1/objects/:id/relationships` result. `unchanged: true` means an identical live edge already existed. */
export interface RelationshipView {
  id: string;
  relationshipTypeId: string;
  relationshipTypeKey: string;
  label: string;
  inverseLabel: string;
  sourceObjectId: string;
  targetObjectId: string;
  metadata: unknown;
  validFrom: string;
  validTo: string | null;
  endReason: string | null;
  unchanged: boolean;
}

/** Body of `POST /v1/objects/:id/relationships/:relationshipId/end`. The row stays; nothing is deleted. */
export interface EndRelationshipParams {
  reason?: string;
}

export type DocumentObjectLinkRole =
  | "primary"
  | "supporting"
  | "evidence"
  | "generated_for"
  | "correspondence";

/** `GET /v1/objects/:id/documents` row. */
export interface DocumentObjectLinkView {
  id: string;
  documentId: string;
  businessObjectId: string;
  role: DocumentObjectLinkRole | string;
  createdAt: string;
  unchanged: boolean;
}

/** Body of `POST /v1/objects/:id/documents`. Idempotent per `(document, object, role)`. */
export interface LinkDocumentParams {
  /** A document id from `documents.create`. */
  documentId: string;
  /** Default `"primary"`. */
  role?: DocumentObjectLinkRole;
}

/** Result of `DELETE /v1/objects/:id/documents/:documentId`. Idempotent: unlinking an absent link succeeds with `removed: false`. */
export interface UnlinkDocumentResult {
  removed: boolean;
}

// ── Search — requires `search:read` (object hits additionally require `objects:read`) ──────────

export type SearchSubjectType = "object" | "document";

/** Query params for `GET /v1/search`. */
export interface SearchParams {
  /** Required, non-empty. Websearch syntax: quote a phrase, `-exclude`, `OR`. */
  q: string;
  subjectType?: SearchSubjectType;
  objectTypeKey?: string;
  classification?: ObjectClassification;
  ownerUserId?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  cursor?: string;
  /** 1 to 100, default 25. */
  limit?: number;
}

/**
 * One hit. `subjectType` is the primary discriminator; `objectTypeKey` is set only on object hits and
 * `documentFormat` only on document hits (mutually exclusive).
 */
export interface SearchResultItem {
  subjectType: SearchSubjectType;
  subjectId: string;
  title: string | null;
  /** Excerpt built only from non-sensitive fields/extracted text. */
  snippet: string;
  classification: string;
  objectTypeKey: string | null;
  documentFormat: string | null;
  state: string | null;
  updatedAt: string;
}

/** `GET /v1/search` result. A hit the caller may not view is silently dropped, not surfaced as a 403. */
export interface SearchAccountPage {
  items: SearchResultItem[];
  nextCursor: string | null;
}

// ── Workflow definitions (read-only) — requires `workflows:read` ────────────────────────────────

export type WorkflowDefinitionStatus = "draft" | "published" | "deprecated";

export interface WorkflowDefinitionView {
  id: string;
  key: string;
  name: string;
  status: WorkflowDefinitionStatus;
  currentVersion: number;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The stage graph / transitions / task templates a workflow definition compiles to. Structure is server-defined. */
export type WorkflowDefinitionSpec = Record<string, unknown>;

export interface WorkflowDefinitionDetailView extends WorkflowDefinitionView {
  draftSpec: WorkflowDefinitionSpec;
}

export interface WorkflowDefinitionVersionSummary {
  id: string;
  version: number;
  snapshotHash: string;
  name: string;
  note: string | null;
  publishedByUserId: string | null;
  publishedAt: string;
  isCurrent: boolean;
}

export interface WorkflowDefinitionVersionDetail extends WorkflowDefinitionVersionSummary {
  spec: WorkflowDefinitionSpec;
}

export interface ListWorkflowDefinitionsParams extends CursorListParams {
  status?: WorkflowDefinitionStatus;
}

// ── Fillable AcroForm templates — requires `documents:upload` (upload) / `render` (fill) ────────
// Not the same surface as `forms.*` (Smart Forms, a Liquid template + JSON Schema). This fills an
// uploaded PDF's own AcroForm fields.

/** A binary payload for a multipart upload: a `Blob`/`File` in browsers, or a `Buffer`/`Uint8Array`+filename in Node. */
export type UploadableFile =
  | Blob
  | { data: Uint8Array | ArrayBuffer; filename: string; contentType?: string };

export interface FormTemplateVersionSummary {
  version: number;
  bytes: number;
  pages: number;
  fieldCount: number;
  contentHash: string;
  createdAt: string;
}

export interface FormTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** A JSON-Schema-shaped node describing one derived AcroForm field contract. Structure is server-defined. */
export type JsonSchemaNode = Record<string, unknown>;

export interface FormTemplateDetail extends FormTemplateSummary {
  /** The current version's derived field-schema contract, or null if it could not be derived. */
  fieldSchema: JsonSchemaNode | null;
}

/** Fields for `POST /v1/form-templates` (multipart; pass the PDF bytes as `file`). */
export interface CreateFormTemplateParams {
  name: string;
  description?: string;
  file: UploadableFile;
}

/** `POST /v1/form-templates` / `POST /v1/form-templates/:id/versions` result. */
export interface FormTemplateUploadResult {
  id: string;
  version: FormTemplateVersionSummary;
}

/** Body of `POST /v1/form-templates/:id/fill`. */
export interface FillFormTemplateParams {
  /** Keyed by the AcroForm's dotted field name, e.g. `"claimant.fullName"`. */
  payload: Record<string, unknown>;
  /** Defaults to the template's current version. */
  version?: number;
}

/** `POST /v1/form-templates/:id/fill` result — stored as an ordinary document (hash chain, retention, delivery all inherited). */
export interface FillResultView {
  documentId: string;
  status: "done";
  version: number;
  bytes: number;
  pages: number;
  contentHash: string;
}

// ── Document intake / upload (first-class document ingestion) — requires `documents:upload` ────
// Distinct from rendering: this ingests a PDF you already have (not a template render).

export interface IntakeResultView {
  id: string;
  status: "done";
  version: number;
  bytes: number;
  pages: number;
  contentHash: string;
  classification: ObjectClassification;
}

/** Fields for `POST /v1/documents/intake` (multipart; pass the PDF bytes as `file`). Synchronous, single file, PDF only. */
export interface IntakeDocumentParams {
  file: UploadableFile;
  objectId?: string;
  /** Default `"evidence"`. */
  objectRole?: DocumentObjectLinkRole;
  /** Default `"internal"`. */
  classification?: ObjectClassification;
}

export type UploadSessionStatus = "open" | "assembling" | "done" | "failed" | "abandoned" | string;

export interface UploadSessionView {
  id: string;
  status: UploadSessionStatus;
  filename: string;
  mediaType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  /** 0-based chunk indexes received so far. */
  receivedChunks: number[];
  receivedBytes: number;
  objectId: string | null;
  objectRole: string | null;
  classification: string | null;
  documentId: string | null;
  errorMessage: string | null;
  isTest: boolean;
  createdByApiKeyId: string | null;
  captureBatchId: string | null;
  /** Sessions expire 24h after creation. */
  expiresAt: string;
  finalizedAt: string | null;
  createdAt: string;
}

/** Body of `POST /v1/documents/intake/sessions`. `chunkSize` is capped at 10 MiB per chunk by the API. */
export interface CreateUploadSessionParams {
  filename: string;
  mediaType?: string;
  totalBytes: number;
  chunkSize: number;
  objectId?: string;
  /** Default `"evidence"` when `objectId` is set. */
  objectRole?: DocumentObjectLinkRole;
  /** Default `"internal"`, staged and applied at finalize. */
  classification?: ObjectClassification;
}

/** One file within a `POST /v1/documents/intake/sessions/batch` request. */
export interface BulkUploadFileParams {
  filename: string;
  mediaType?: string;
  totalBytes: number;
  chunkSize: number;
}

/** Body of `POST /v1/documents/intake/sessions/batch` — start up to 200 resumable sessions at once. */
export interface CreateUploadSessionBatchParams {
  name?: string;
  files: BulkUploadFileParams[];
  objectId?: string;
  objectRole?: DocumentObjectLinkRole;
  classification?: ObjectClassification;
}

export interface CaptureBatchView {
  id: string;
  status: string;
  name: string | null;
  captureSourceId: string | null;
  captureProfileId: string | null;
  ingestionCampaignId: string | null;
  totalItems: number;
  discoveredItems: number;
  acceptedItems: number;
  duplicateItems: number;
  rejectedItems: number;
  errorItems: number;
  errorMessage: string | null;
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** One file's outcome within a batch-session create — success and failure are reported per file, not for the whole call. */
export type CreateUploadSessionBatchFileResult =
  | { ok: true; session: UploadSessionView }
  | { ok: false; filename: string; error: string };

export interface CreateUploadSessionBatchResult {
  batch: CaptureBatchView;
  sessions: CreateUploadSessionBatchFileResult[];
}

/** `POST /v1/documents/intake/sessions/:id/finalize` — a single-file/PDF session finalizes to this. */
export type IntakeFinalizeResult = IntakeResultView | IntakeArchiveResultView;

/** One member's outcome inside a finalized ZIP intake session. */
export interface ArchiveMemberResultView {
  path: string;
  ok: boolean;
  documentId?: string;
  bytes?: number;
  pages?: number;
  contentHash?: string;
  error?: string;
}

/** `POST /v1/documents/intake/sessions/:id/finalize` — a ZIP session expands into many documents. */
export interface IntakeArchiveResultView {
  status: "expanded";
  captureBatchId: string;
  accepted: number;
  duplicate: number;
  rejected: number;
  error: number;
  members: ArchiveMemberResultView[];
}

// ── Error registry (public, unauthenticated) ─────────────────────────────────────────────────────

/** `GET /v1/errors` row — one coded API failure, with the HTTP status it always answers with. */
export interface ErrorCatalogEntry {
  /** Dot-namespaced, e.g. `"formtemplate.malware_detected"`. */
  code: string;
  status: number;
  summary: string;
  cause: string;
  resolution: string;
  retryability: string;
  /** True for a deliberate refusal (e.g. a TSA outage, an SSRF block, a schematron reject). */
  failClosed?: boolean;
}

/** `GET /v1/errors` — the full public error-code catalog, for building typed handling around `PageWeaverAPIError.code`. */
export interface ErrorCatalogResponse {
  domains: readonly string[];
  codes: readonly ErrorCatalogEntry[];
}

// ── Domain events (append-only ledger) — requires `read` (baseline) ─────────────────────────────

/** Query params for `GET /v1/events`. */
export interface ListEventsParams {
  /** Resume point: the seq (as a string) last processed. Exclusive. */
  after?: string;
  /** 1 to 200, default 50. */
  limit?: number;
  type?: string;
  subjectType?: string;
  subjectId?: string;
  correlationId?: string;
}

/** One row of the append-only domain-event ledger. `payload` never carries request bodies, field values, or recipient addresses. */
export interface DomainEventView {
  id: string;
  /** A BigInt, serialized as a string to avoid precision loss past 2^53. */
  seq: string;
  type: string;
  version: number;
  subjectType: string | null;
  subjectId: string | null;
  payload: unknown;
  correlationId: string | null;
  /** ISO 8601 timestamp. */
  at: string;
}

/** `GET /v1/events` result. Entries are filtered to what the key's scopes can see; hidden ones are silently dropped. */
export interface DomainEventPage {
  events: DomainEventView[];
  /** The last seq this query READ (not necessarily returned) — resume from here even if trailing events were scope-trimmed. */
  nextCursor: string | null;
  /** The account's newest position, regardless of this reader's visibility. */
  latestSeq: string;
}
