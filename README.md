# @pageweaver/sdk

Official TypeScript SDK for the [PageWeaver](https://pageweaver.io) PDF generation API. Create PDFs from versioned templates and typed JSON payloads (or from inline HTML), then poll or receive a webhook for the result.

Works in any server-side JavaScript runtime with a global `fetch` (Node 18+, Bun, Deno, edge runtimes). Fully typed, zero runtime dependencies.

## Install

```bash
npm install @pageweaver/sdk
```

## Quickstart

```ts
import { PageWeaver } from "@pageweaver/sdk";

const pw = new PageWeaver({ apiKey: process.env.PAGEWEAVER_API_KEY! });

// Create a document and wait for it to finish rendering.
const doc = await pw.documents.createAndWait({
  templateId: "tmpl_invoice",
  payload: { invoiceNumber: "1042", total: 4200 },
});

// Download the finished PDF.
const pdf = await pw.documents.download(doc.id);
await fs.writeFile("invoice.pdf", pdf);
```

`createAndWait` submits the render, polls until it is done, and resolves with the finished document. If you would rather manage polling yourself, use `create` then `get` (or `waitFor`).

## Configuration

```ts
const pw = new PageWeaver({
  apiKey: "pk_live_...",              // required
  baseUrl: "https://api.pageweaver.io", // default; use http://localhost:4000 for local dev
  timeoutMs: 30000,                   // per-request timeout
});
```

Your API key comes from the portal (`pk_test_...` for development, `pk_live_...` for production).

## Creating documents

### From a template

```ts
const doc = await pw.documents.create({
  templateId: "tmpl_invoice",
  payload: { invoiceNumber: "1042", lineItems: [{ name: "Widget", qty: 3 }] },
  version: 4, // optional: pin a published version so future edits never change this output
});
// { id, status: "queued", version }
```

The payload is validated against the template's JSON Schema before the render is queued. A validation failure throws a `PageWeaverApiError` (status 400) whose `errors` field lists what was wrong.

### From inline HTML

```ts
const doc = await pw.documents.create({
  html: "<h1>Hello {{ name }}</h1>",
  css: "h1 { color: #4f46e5 }",
  payload: { name: "Ada" },
});
```

Inline HTML may use Liquid tokens and reference your uploaded image assets by name. External images, stylesheets, and JavaScript are rejected.

### Per-render options

Every document property is overridable per request under the single `options` key, layered on the template's saved settings for that render only:

```ts
await pw.documents.create({
  templateId: "tmpl_invoice",
  payload,
  options: {
    page: { size: "A4", orientation: "portrait", margin: "18mm" },
    metadata: { title: "Invoice #1042", author: "Acme Inc." },
    footer: { center: "Page {{@page}} of {{@pages}}" },
    watermark: { text: "DRAFT", opacity: 0.3 },
    localization: { locale: "de-DE", timeZone: "Europe/Berlin", currency: "EUR" },
  },
});
```

### Archival PDF/A

`output.pdfa` issues the document as a validated PDF/A, the format long-term archives and public-sector buyers ask for.

```ts
const doc = await pw.documents.createAndWait({
  templateId: "tmpl_invoice",
  payload,
  output: { pdfa: "3b" }, // "2b" | "3b" | "none"
});
doc.pdfa; // "3b"
doc.outputNotices; // what had to change to honor the request
```

`2b` and `3b` produce a validated PDF/A; `3b` is the one to choose when the document may later carry an embedded machine-readable payload. **`1b` is not offered** because the conversion cannot produce one that passes validation, and offering a level that fails a validator would be worse than not offering it. Send `"none"` to opt out of a template that defaults to archival output.

Three things change, and two of them are invisible in the produced document:

- **Links stop working.** Every clickable link annotation is dropped by the conversion. Link text still looks like a link.
- **Some text stops being extractable.** Text set with OpenType feature substitution, most commonly `font-variant-numeric: tabular-nums`, looks identical but can no longer be selected, searched, or copied. Level b conformance does not require character mapping, so a PDF/A document is **not** a machine-readability guarantee.
- **`Author` is not written**, because PDF/A cannot record it conformantly. Every other metadata field is written normally, and the drop is reported in `outputNotices`.

A **digital signature** works alongside it: the signature is applied after the archival conversion and the result still validates. It cannot be combined with an image `format`, a PDF open-password, or a `url` render (each returns a 400), and it adds roughly 200ms plus 25ms per page.

### Accessible PDF/UA

`output.pdfUa` issues a tagged, screen-reader-ready document that is validated against **PDF/UA-1** (ISO 14289-1) by the veraPDF reference validator before it is released. This is the standard EN 301 549 and Section 508 procurement point at.

```ts
const doc = await pw.documents.createAndWait({
  templateId: "tmpl_invoice",
  payload,
  output: { pdfUa: "1" }, // "1" | "none"
});
doc.accessibility; // { standard: "PDF/UA-1", conformant: true, reportAvailable: true }

const report = await pw.documents.accessibility(doc.id); // every rule, with its ISO clause
```

**Conformance depends on your markup, not only on asking for it.** A tagged PDF is built from the semantics of your HTML, so your template needs to: set a language on `<html>`, have a title, give every image real alt text (an empty `alt` is not accepted, use a CSS background for decoration), label inline SVG with `role="img"` + `aria-label`, keep headings in order starting at `<h1>`, and use `<th>` cells in tables. The mechanical parts are handled for you: the role map, link descriptions, the document language, marking running headers and footers as artifacts, and the conformance declaration.

By default a document that does not conform is a **failed** document, so anything you receive with the claim has been checked. Pass `conformance: "attempt"` while you are still adjusting a template to get the document anyway with the violations listed.

A **large-print variant** is the same template and payload with `options.page.scale`, and is validated the same way.

A **digital signature** works alongside it: the conformance check runs on the signed document, so the verdict covers the file you receive. It cannot be combined with a watermark, a PDF open-password, PDF/A, an image `format`, or a `url` render (each returns a 400).

## Polling

```ts
const created = await pw.documents.create({ templateId: "t", payload });

// Block until terminal (done or failed), with backoff and a timeout.
const done = await pw.documents.waitFor(created.id, {
  intervalMs: 1000,
  timeoutMs: 60000,
});
```

`waitFor` throws `PageWeaverDocumentFailedError` if the document fails. Pass `throwOnFailure: false` to receive the failed document instead.

## Downloading

```ts
// Unprotected document: the signed URL is resolved and fetched for you.
const pdf = await pw.documents.download(doc.id);

// Download-protected document: supply the download password.
const pdf = await pw.documents.download(doc.id, { password: "the-download-password" });
```

`download` returns a `Uint8Array`. For a protected document created with `options.security.download`, the response to `create`/`get` includes the generated password in `download.password` (visible only to you, the owner).

## Listing history

```ts
const page = await pw.documents.list({ status: "done", limit: 50 });
// { items, nextCursor }

// Or iterate every page automatically:
for await (const item of pw.documents.listAll({ status: "failed" })) {
  console.log(item.id, item.error);
}
```

## Regenerate

```ts
const replay = await pw.documents.regenerate(doc.id);
```

Faithfully replays a prior document with the same version, payload, and options. Returns a new document id.

## Discovery (read only)

```ts
await pw.templates.list();
await pw.templates.get("tmpl_invoice");
await pw.templates.versions("tmpl_invoice");

await pw.schemas.list();
await pw.schemas.get("schema_id", { version: 2 });

await pw.usage.get(); // page consumption vs. your plan quota this period
```

## Webhooks

Set `callbackUrl` on a create call (or a default in the portal) to receive a signed POST when a document reaches a terminal state. Verify the signature before trusting the payload:

```ts
import { verifyWebhook, isDocumentEvent } from "@pageweaver/sdk";

// Express example. Give the verifier the RAW request body bytes.
app.post("/webhooks/pageweaver", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const event = verifyWebhook({
      secret: process.env.PAGEWEAVER_WEBHOOK_SECRET!,
      body: req.body.toString("utf8"),
      signature: req.headers["x-pageweaver-signature"],
    });

    if (isDocumentEvent(event) && event.status === "done") {
      console.log("Document ready:", event.documentId, event.url);
    }
    res.sendStatus(200);
  } catch {
    res.sendStatus(400); // invalid signature
  }
});
```

Always verify against the unparsed body. Re-serializing a parsed object can change the bytes and break the signature.

## Document lineage: trust, diff, versions, representations

```ts
await pw.documents.trust("doc_1"); // one deterministic integrity + provenance manifest
await pw.documents.diff("doc_1", "doc_2"); // causal diff between two documents; never renders or meters

// Reissue a template-pinned document under the same lineage (fires `document.superseded`):
await pw.documents.appendVersion("doc_1", { payload: { total: 51 } });
await pw.documents.versions("doc_1"); // the full lineage, newest first
await pw.documents.representations("doc_1"); // every artifact of one version (PDF, e-invoice XML, JSON twin, ...)
```

## Typed business records (objects, object types, relationships)

Requires an API key with the matching scope — `objects:read` / `objects:write` / `object-types:manage` / `relationships:manage`; see [Scopes](#scopes).

```ts
// Define a record type, then publish it (freezes an immutable version):
const type = await pw.objectTypes.create({
  key: "invoice",
  nameSingular: "Invoice",
  namePlural: "Invoices",
  schema: { type: "object", properties: { total: { type: "number" } } },
});
await pw.objectTypes.publish(type.id);

// Create + replace a record. `replace` requires expectedVersion — a 409 on mismatch, never a lost update.
const invoice = await pw.objects.create({ objectTypeKey: "invoice", data: { total: 42 } });
await pw.objects.replace(invoice.id, { data: { total: 51 }, expectedVersion: invoice.version });

// Relate records, and file a rendered document against one:
await pw.objects.addRelationship(invoice.id, { relationshipTypeKey: "billed_to", targetObjectId: customer.id });
await pw.objects.linkDocument(invoice.id, { documentId: doc.id, role: "primary" });
```

## Search, domain events, and the error registry

```ts
await pw.search.query({ q: "acme invoice", subjectType: "object" }); // requires the search:read scope

// The append-only event ledger — resume from `nextCursor`, not the last event you saw:
for await (const event of pw.events.listAll({ type: "document.completed" })) {
  console.log(event.type, event.subjectId);
}

await pw.errorCodes.list(); // the full public error-code catalog (no API key required)
```

## Document ingestion and fillable PDFs

```ts
// Bring in a PDF you already have (not a template render):
await pw.intake.create({ file: { data: bytes, filename: "scan.pdf" }, classification: "internal" });

// Large files: a resumable chunked session.
const session = await pw.intake.sessions.create({ filename: "big.pdf", totalBytes, chunkSize });
await pw.intake.sessions.uploadChunk(session.id, 0, chunk0);
await pw.intake.sessions.finalize(session.id);

// Fill an uploaded PDF's own AcroForm fields (not a Liquid template):
const template = await pw.formTemplates.create({ name: "Claim form", file: { data: bytes, filename: "claim.pdf" } });
await pw.formTemplates.fill(template.id, { payload: { "claimant.fullName": "Ada Lovelace" } });
```

## Scopes

Every API key carries the baseline `read` + `render` scopes. Everything else is opt-in, set per key in the portal:

| Scope | Gates |
| --- | --- |
| `review` | Comments, reviews, share links |
| `deploy` | Environments, deployments, template proposals |
| `objects:read` / `objects:write` | Reading / writing typed business records |
| `objects:read-sensitive` | Decrypting a record's sensitive fields (stacks on `objects:read`) |
| `object-types:manage` | Defining and publishing object types |
| `relationships:manage` | Object relationships, and filing documents against objects |
| `documents:upload` | Document intake and fillable-form-template uploads |
| `search:read` | `pw.search.query()` |
| `workflows:read` | `pw.workflowDefinitions.*` |

A call missing a required scope fails with a `403` — a `PageWeaverPermissionError` (see below).

## Retries

GET/HEAD/PUT/DELETE requests, and any POST sent with an `idempotencyKey`, are retried automatically on `429` and `5xx` with exponential backoff + jitter (honoring `Retry-After` on `429`). A plain POST with no idempotency key is never retried, since a duplicate render or record is worse than a failed request. Tune it per client or per call:

```ts
const pw = new PageWeaver({ apiKey, retry: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 8000 } });

// Disable retries for one call:
await pw.documents.list({}, undefined); // reads always retry by default; pass { retry: { maxRetries: 0 } } via a lower-level call to opt out
```

## Errors

Every error extends `PageWeaverError`. A non-2xx API response throws a `PageWeaverApiError` subclass selected by status, so you can catch the specific failure kind — or just `PageWeaverApiError` to catch all of them:

| Class | Status | Thrown when |
| --- | --- | --- |
| `PageWeaverValidationError` | 400 / 422 | The request body or query failed validation. `errors` carries field-level detail. |
| `PageWeaverAuthenticationError` | 401 | The API key is missing, invalid, or the account is suspended. |
| `PageWeaverPlanRequiredError` | 402 | A billing problem, not a credential one: the account's plan doesn't include this capability at all — no key, however scoped, can call it until the account upgrades. |
| `PageWeaverPermissionError` | 403 | A credential problem: the key authenticated fine but isn't allowed to do this. Check `err.isScopeMissing` / `err.requiredScope` when it's a missing scope. |
| `PageWeaverNotFoundError` | 404 | No such resource (or it belongs to another account). |
| `PageWeaverConflictError` | 409 | An `expectedVersion`/`If-Match` mismatch, a duplicate key, or a state conflict. |
| `PageWeaverRateLimitError` | 429 | Rate limited or over a usage quota. `retryAfterSeconds` when the API sent `Retry-After`. |
| `PageWeaverServerError` | 5xx | The API failed unexpectedly. |
| `PageWeaverApiError` | any | The base class — every subclass above extends it, and it also covers any other status. |
| `PageWeaverInvalidRequestError` | — | A client-side shape check failed before any request was sent (e.g. a blank id). |
| `PageWeaverConnectionError` | — | A network failure, or the request timed out. |
| `PageWeaverTimeoutError` | — | `waitFor` exceeded its timeout before the document finished. |
| `PageWeaverDocumentFailedError` | — | The document reached the `failed` state while waiting. Carries the `document`. |
| `PageWeaverWebhookSignatureError` | — | A webhook signature did not match the body. |

```ts
import {
  PageWeaverValidationError,
  PageWeaverRateLimitError,
  PageWeaverPlanRequiredError,
  PageWeaverPermissionError,
  PageWeaverApiError,
} from "@pageweaver/sdk";

try {
  await pw.documents.create({ templateId: "t", payload, output: { format: "facturx" } });
} catch (err) {
  if (err instanceof PageWeaverValidationError) {
    console.error("Validation failed:", err.errors);
  } else if (err instanceof PageWeaverRateLimitError) {
    console.error("Rate limited, retry after", err.retryAfterSeconds, "seconds");
  } else if (err instanceof PageWeaverPlanRequiredError) {
    // A billing problem: the account's plan doesn't include this feature at all.
    console.error("Upgrade required:", err.message);
  } else if (err instanceof PageWeaverPermissionError) {
    // A credential problem: this specific API key isn't allowed to do this.
    if (err.isScopeMissing) console.error(`Mint a key with the '${err.requiredScope}' scope.`);
    else console.error("Forbidden:", err.message);
  } else if (err instanceof PageWeaverApiError) {
    console.error(err.code, err.status, err.requestId);
  } else {
    throw err;
  }
}
```

Look up any `err.code` in `pw.errorCodes.list()` for its cause and resolution. `PageWeaverPlanRequiredError` (402) and `PageWeaverPermissionError` (403) are easy to conflate — both read as "you can't do that" — but the fix differs: a plan error is resolved by the account upgrading, a scope error by minting a new API key with the missing scope. Branch on the class, not the status code.

## Migrating off living documents

The `/v1/living-documents/*` surface (and the SDK's old `pw.livingDocuments` resource) has been retired and
folded into ordinary documents:

- `livingDocuments.create({ templateId, payload, publicAlias })` → `documents.create({ templateId, payload, publicAlias: true })`. The minted link comes back as `result.alias.token` instead of a separate identity.
- `livingDocuments.reissue(id, { payload })` → `documents.appendVersion(documentId, { payload })`.
- `livingDocuments.get(id)` / `.list()` / `.version(id, seq)` → `documents.versions(documentId)` / `documents.version(documentId, seq)`.

## License

MIT
