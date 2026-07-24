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

It cannot be combined with an image `format`, a PDF open-password, a digital signature, or a `url` render (each returns a 400), and it adds roughly 200ms plus 25ms per page.

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

## Errors

Every error extends `PageWeaverError`:

| Class | Thrown when |
| --- | --- |
| `PageWeaverApiError` | The API returned a non-2xx response. Carries `status`, `code`, `errors`, `body`. |
| `PageWeaverConnectionError` | A network failure, or the request timed out. |
| `PageWeaverTimeoutError` | `waitFor` exceeded its timeout before the document finished. |
| `PageWeaverDocumentFailedError` | The document reached the `failed` state while waiting. Carries the `document`. |
| `PageWeaverWebhookSignatureError` | A webhook signature did not match the body. |

```ts
import { PageWeaverApiError } from "@pageweaver/sdk";

try {
  await pw.documents.create({ templateId: "t", payload });
} catch (err) {
  if (err instanceof PageWeaverApiError && err.status === 400) {
    console.error("Validation failed:", err.errors);
  } else {
    throw err;
  }
}
```

## License

MIT
