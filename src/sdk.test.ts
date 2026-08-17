import assert from "node:assert/strict";
import { test } from "node:test";
import { PageWeaver } from "./client";
import { PageWeaverAPIError, PageWeaverDocumentFailedError } from "./errors";
import {
  signWebhookBody,
  verifyWebhook,
  verifyWebhookSignature,
  isDocumentEvent,
  PageWeaverWebhookSignatureError,
} from "./webhooks";
import type { FetchLike } from "./http";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Build a fake fetch that records calls and returns a scripted queue of responses. */
function mockFetch(responses: Response[]): {
  fetch: FetchLike;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: rawBody ? JSON.parse(rawBody) : undefined,
    });
    const res = responses[i++];
    if (!res) throw new Error("mockFetch: no scripted response left");
    return res;
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("documents.create posts with auth + idempotency header and strips it from the body", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "doc_1", status: "queued", version: 3 }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const res = await pw.documents.create({
    templateId: "tmpl_invoice",
    payload: { total: 42 },
    version: 3,
    idempotencyKey: "idem-1",
  });

  assert.equal(res.id, "doc_1");
  assert.equal(res.status, "queued");
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "http://api.test/v1/documents");
  assert.equal(call.method, "POST");
  assert.equal(call.headers["x-api-key"], "pk_test_abc");
  assert.equal(call.headers["idempotency-key"], "idem-1");
  // idempotencyKey travels as a header, not in the JSON body.
  assert.deepEqual(call.body, {
    templateId: "tmpl_invoice",
    payload: { total: 42 },
    version: 3,
  });
});

test("documents.create sends a facturx output with an inline EInvoice", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "doc_fx", status: "queued", version: 1 }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const res = await pw.documents.create({
    templateId: "tmpl_invoice",
    payload: { any: "thing" },
    output: {
      format: "facturx",
      invoice: {
        invoiceNumber: "INV-2026-001",
        issueDate: "2026-07-25",
        currency: "EUR",
        seller: { name: "Acme GmbH", vatId: "DE123456789", address: { countryCode: "DE" } },
        buyer: { name: "Buyer SARL", address: { countryCode: "FR" } },
        lines: [
          { name: "Consulting", quantity: 2, netPrice: 500, vatCategory: "S", vatRate: 19 },
        ],
      },
    },
  });

  assert.equal(res.id, "doc_fx");
  const call = calls[0];
  assert.ok(call);
  const body = call.body as { output?: { format?: string; invoice?: { invoiceNumber?: string } } };
  assert.equal(body.output?.format, "facturx");
  // The full canonical invoice travels in the body untouched.
  assert.equal(body.output?.invoice?.invoiceNumber, "INV-2026-001");
});

test("documents.create sends a ubl output with Peppol profile ids on the inline invoice", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "doc_ubl", status: "queued", version: 1 }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const res = await pw.documents.create({
    templateId: "tmpl_invoice",
    payload: { any: "thing" },
    output: {
      format: "ubl",
      invoice: {
        invoiceNumber: "INV-2026-002",
        issueDate: "2026-07-25",
        currency: "EUR",
        customizationId: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
        profileId: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
        seller: { name: "Acme GmbH", vatId: "DE123456789", address: { countryCode: "DE" } },
        buyer: { name: "Buyer SARL", address: { countryCode: "FR" } },
        lines: [{ name: "Consulting", quantity: 1, netPrice: 500, vatCategory: "S", vatRate: 19 }],
      },
    },
  });

  assert.equal(res.id, "doc_ubl");
  const call = calls[0];
  assert.ok(call);
  const body = call.body as { output?: { format?: string; invoice?: { profileId?: string } } };
  assert.equal(body.output?.format, "ubl");
  assert.equal(body.output?.invoice?.profileId, "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0");
});

test("documents.createSync defaults to JSON with the download url (no Accept: application/pdf)", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      id: "doc_sync",
      status: "done",
      version: 2,
      download: {
        protected: false,
        requiresPassword: false,
        url: "http://cdn.test/doc_sync.pdf",
      },
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const out = await pw.documents.createSync({
    templateId: "t",
    payload: { a: 1 },
  });

  assert.equal(out.kind, "document");
  if (out.kind === "document") {
    assert.equal(out.document.status, "done");
    assert.equal(out.document.download?.url, "http://cdn.test/doc_sync.pdf");
  }
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.method, "POST");
  assert.equal(call.headers["prefer"], "wait");
  // The default does NOT request raw bytes — it wants the JSON document with the url.
  assert.notEqual(call.headers["accept"], "application/pdf");
});

test("documents.createSync streams raw PDF bytes with { pdf: true } (Accept: application/pdf)", async () => {
  const pdf = new Uint8Array([37, 80, 68, 70, 45]); // %PDF-
  const { fetch, calls } = mockFetch([
    new Response(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "x-document-id": "doc_sync",
        "x-document-version": "2",
      },
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const out = await pw.documents.createSync(
    { templateId: "t", payload: { a: 1 } },
    { pdf: true },
  );

  assert.equal(out.kind, "pdf");
  if (out.kind === "pdf") {
    assert.deepEqual(out.pdf, pdf);
    assert.equal(out.id, "doc_sync");
    assert.equal(out.version, 2);
  }
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.headers["prefer"], "wait");
  assert.equal(call.headers["accept"], "application/pdf");
});

test("documents.proofPack GETs the proof sub-path as bytes with Accept: application/zip", async () => {
  const zip = new Uint8Array([80, 75, 3, 4]); // PK\x03\x04
  const { fetch, calls } = mockFetch([
    new Response(zip, {
      status: 200,
      headers: { "content-type": "application/zip" },
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const out = await pw.documents.proofPack("doc_1");

  assert.deepEqual(out, zip);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.method, "GET");
  assert.equal(call.url, "http://api.test/v1/documents/doc_1/proof");
  assert.equal(call.headers["accept"], "application/zip");
});

test("documents.createSync falls back to a pending result when the wait deadline is exceeded", async () => {
  const { fetch } = mockFetch([
    json(202, { id: "doc_slow", status: "rendering", version: 1 }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const out = await pw.documents.createSync({ templateId: "t", payload: {} });

  assert.equal(out.kind, "pending");
  if (out.kind === "pending") {
    assert.equal(out.id, "doc_slow");
    assert.equal(out.status, "rendering");
  }
});

test("documents.createSync returns JSON (never bytes) for a protected document even with { pdf: true }", async () => {
  const { fetch } = mockFetch([
    json(200, {
      id: "doc_prot",
      status: "done",
      version: 1,
      download: {
        protected: true,
        requiresPassword: true,
        url: "http://api.test/v1/documents/doc_prot/content",
      },
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const out = await pw.documents.createSync(
    { templateId: "t", payload: {} },
    { pdf: true },
  );

  assert.equal(out.kind, "document");
  if (out.kind === "document") {
    assert.equal(out.document.status, "done");
    assert.equal(out.document.download?.protected, true);
  }
});

test("documents.waitFor polls until the document is done", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "doc_2", status: "queued", version: 1 }),
    json(200, { id: "doc_2", status: "queued", version: 1 }),
    json(200, { id: "doc_2", status: "rendering", version: 1 }),
    json(200, {
      id: "doc_2",
      status: "done",
      version: 1,
      download: {
        protected: false,
        requiresPassword: false,
        url: "http://cdn.test/doc_2.pdf",
      },
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const doc = await pw.documents.createAndWait(
    { templateId: "t", payload: {} },
    { intervalMs: 1, maxIntervalMs: 2, timeoutMs: 5000 },
  );

  assert.equal(doc.status, "done");
  assert.equal(doc.download?.url, "http://cdn.test/doc_2.pdf");
  assert.equal(calls.length, 4); // 1 create + 3 polls
});

test("documents.waitFor throws PageWeaverDocumentFailedError on failure", async () => {
  const { fetch } = mockFetch([
    json(200, { id: "doc_3", status: "failed", version: 1, error: "boom" }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await assert.rejects(
    () => pw.documents.waitFor("doc_3", { intervalMs: 1 }),
    (err: unknown) => {
      assert.ok(err instanceof PageWeaverDocumentFailedError);
      assert.equal(err.document.error, "boom");
      return true;
    },
  );
});

test("a non-2xx response becomes a PageWeaverAPIError carrying status + errors", async () => {
  const { fetch } = mockFetch([
    json(400, {
      message: "Payload failed validation",
      errors: [{ path: "/total" }],
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await assert.rejects(
    () => pw.documents.create({ templateId: "t", payload: {} }),
    (err: unknown) => {
      assert.ok(err instanceof PageWeaverAPIError);
      assert.equal(err.status, 400);
      assert.equal(err.message, "Payload failed validation");
      assert.deepEqual(err.errors, [{ path: "/total" }]);
      return true;
    },
  );
});

test("documents.list serializes query params", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { items: [], nextCursor: null }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.documents.list({ status: "done", limit: 5, templateId: "t" });

  const call = calls[0];
  assert.ok(call);
  assert.equal(
    call.url,
    "http://api.test/v1/documents?status=done&templateId=t&limit=5",
  );
});

test("documents.list reconciles a batch's per-item delivery across both channels (E11)", async () => {
  const { fetch, calls } = mockFetch([json(200, { items: [], nextCursor: null })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.documents.list({ batchId: "bat_1", delivery: "undelivered", storageDelivery: "failed" });

  const call = calls[0];
  assert.ok(call);
  assert.equal(
    call.url,
    "http://api.test/v1/documents?batchId=bat_1&delivery=undelivered&storageDelivery=failed",
  );
});

test("documents.verify calls the verify endpoint with auth", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      documentId: "doc_9",
      status: "done",
      contentHash: "abc123",
      hashAlg: "sha256",
      chainSeq: 4,
      chainVerified: true,
      issuedAt: "2026-07-03T00:00:00.000Z",
      signature: null,
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const result = await pw.documents.verify("doc_9");

  assert.equal(result.contentHash, "abc123");
  assert.equal(result.chainVerified, true);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "http://api.test/v1/documents/doc_9/verify");
  assert.equal(call.headers["x-api-key"], "pk_test_abc");
});

test("documents.validate posts to the validate endpoint and returns the dry-run result", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      ok: false,
      errors: ["(root) must have required property 'customer'"],
      templateId: "tmpl_invoice",
      version: 3,
      schemaId: "sch_1",
      schemaVersion: 2,
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const result = await pw.documents.validate({
    templateId: "tmpl_invoice",
    payload: { invoiceNumber: "A-1" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.version, 3);
  assert.ok(result.errors[0]?.includes("customer"));
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.method, "POST");
  assert.equal(call.url, "http://api.test/v1/documents/validate");
  assert.equal(call.headers["x-api-key"], "pk_test_abc");
  assert.deepEqual(call.body, {
    templateId: "tmpl_invoice",
    payload: { invoiceNumber: "A-1" },
  });
});

test("documents.download with a password hits the content endpoint without the API key", async () => {
  const pdf = new Uint8Array([37, 80, 68, 70]); // %PDF
  const { fetch, calls } = mockFetch([new Response(pdf, { status: 200 })]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const bytes = await pw.documents.download("doc_9", { password: "hunter2" });

  assert.deepEqual(bytes, pdf);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "http://api.test/v1/documents/doc_9/content");
  assert.equal(call.headers["x-document-password"], "hunter2");
  assert.equal(call.headers["x-api-key"], undefined); // recipient-facing: no API key
});

test("templates.versions calls the right path", async () => {
  const { fetch, calls } = mockFetch([json(200, [])]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.templates.versions("tmpl_1");

  assert.equal(calls[0]?.url, "http://api.test/v1/templates/tmpl_1/versions");
});

test("templates.version fetches one version with include=source", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { version: 3, editorMode: "code", source: {} }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.templates.version("tmpl_1", 3, { include: "source" });

  assert.equal(
    calls[0]?.url,
    "http://api.test/v1/templates/tmpl_1/versions/3?include=source",
  );
});

test("schemas.version fetches one version with include=nodes", async () => {
  const { fetch, calls } = mockFetch([json(200, { version: 2, nodes: [] })]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.schemas.version("schema_1", 2, { include: "nodes" });

  assert.equal(
    calls[0]?.url,
    "http://api.test/v1/schemas/schema_1/versions/2?include=nodes",
  );
});

test("verifyWebhook round-trips and rejects tampering", () => {
  const secret = "whsec_test";
  const payload = {
    event: "document.completed" as const,
    documentId: "doc_1",
    templateId: "t",
    version: 1,
    status: "done" as const,
    url: "http://cdn.test/doc_1.pdf",
    createdAt: "2026-07-02T00:00:00.000Z",
  };
  const body = JSON.stringify(payload);
  const signature = signWebhookBody(secret, body);

  const event = verifyWebhook({ secret, body, signature });
  assert.ok(isDocumentEvent(event));
  assert.equal(event.documentId, "doc_1");

  // Tampered body no longer matches.
  assert.equal(verifyWebhookSignature(secret, body + " ", signature), false);
  assert.throws(
    () => verifyWebhook({ secret, body: body + " ", signature }),
    PageWeaverWebhookSignatureError,
  );
  // Missing signature.
  assert.equal(verifyWebhookSignature(secret, body, undefined), false);
});

// ─── Review layer (V2-A07) ──────────────────────────────────────────────────────

test("comments.create posts an anchored thread to /v1/comments", async () => {
  const { fetch, calls } = mockFetch([
    json(201, {
      id: "cth_1",
      documentId: "doc_1",
      anchorType: "point",
      status: "open",
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const thread = await pw.comments.create({
    documentId: "doc_1",
    anchorType: "point",
    pageNumber: 1,
    x: 0.5,
    y: 0.5,
    body: "Fix this",
  });

  assert.equal(thread.id, "cth_1");
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.method, "POST");
  assert.equal(call.url, "http://api.test/v1/comments");
  assert.equal(call.headers["x-api-key"], "pk_test_abc");
  assert.deepEqual(call.body, {
    documentId: "doc_1",
    anchorType: "point",
    pageNumber: 1,
    x: 0.5,
    y: 0.5,
    body: "Fix this",
  });
});

test("comments.list hits the document-scoped path with filters as query params", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { items: [], nextCursor: null }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.comments.list({
    documentId: "doc_1",
    status: "open",
    pageNumber: 2,
  });

  const call = calls[0];
  assert.ok(call);
  assert.equal(call.method, "GET");
  assert.equal(
    call.url,
    "http://api.test/v1/documents/doc_1/comments?pageNumber=2&status=open",
  );
});

test("comments.resolve posts to the resolve sub-path", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { id: "cth_1", status: "resolved" }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const thread = await pw.comments.resolve("cth_1");

  assert.equal(thread.status, "resolved");
  assert.equal(calls[0]?.url, "http://api.test/v1/comments/cth_1/resolve");
  assert.equal(calls[0]?.method, "POST");
});

test("reviews.create posts to /v1/reviews with policy + participants", async () => {
  const { fetch, calls } = mockFetch([
    json(201, { id: "rev_1", documentId: "doc_1", status: "open" }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const review = await pw.reviews.create({
    documentId: "doc_1",
    title: "Sign-off",
    participants: [{ userId: "usr_2", role: "approver" }],
    policy: { requiredApproverCount: 2 },
  });

  assert.equal(review.id, "rev_1");
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "http://api.test/v1/reviews");
  assert.deepEqual(call.body, {
    documentId: "doc_1",
    title: "Sign-off",
    participants: [{ userId: "usr_2", role: "approver" }],
    policy: { requiredApproverCount: 2 },
  });
});

test("reviews.approve posts a decision to the approvals sub-path", async () => {
  const { fetch, calls } = mockFetch([
    json(201, { id: "rev_1", status: "completed" }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.reviews.approve("rev_1", { decision: "approved", note: "LGTM" });

  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "http://api.test/v1/reviews/rev_1/approvals");
  assert.deepEqual(call.body, { decision: "approved", note: "LGTM" });
});

test("reviews.list forwards status + documentId as query params", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { items: [], nextCursor: null }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.reviews.list({ status: "open", documentId: "doc_1" });

  assert.equal(
    calls[0]?.url,
    "http://api.test/v1/reviews?status=open&documentId=doc_1",
  );
});

test("shareLinks.create returns the raw url/token once", async () => {
  const { fetch, calls } = mockFetch([
    json(201, {
      id: "shl_1",
      url: "http://portal/r/tok",
      token: "tok",
      targetType: "render",
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const link = await pw.shareLinks.create({
    targetType: "render",
    documentId: "doc_1",
    permissions: { canComment: true },
  });

  assert.equal(link.url, "http://portal/r/tok");
  assert.equal(link.token, "tok");
  assert.equal(calls[0]?.url, "http://api.test/v1/share-links");
});

test("shareLinks.disable posts to the disable sub-path", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { id: "shl_1", disabledAt: "2026-07-06T00:00:00Z" }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.shareLinks.disable("shl_1");

  assert.equal(calls[0]?.url, "http://api.test/v1/share-links/shl_1/disable");
  assert.equal(calls[0]?.method, "POST");
});

test("documents.pages + migrateComments hit the document sub-paths", async () => {
  const { fetch, calls } = mockFetch([
    json(200, [
      {
        pageNumber: 1,
        widthPts: 612,
        heightPts: 792,
        hasText: true,
        hasThumbnail: true,
      },
    ]),
    json(202, { status: "queued" }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const pages = await pw.documents.pages("doc_1");
  assert.equal(pages[0]?.pageNumber, 1);
  assert.equal(calls[0]?.url, "http://api.test/v1/documents/doc_1/pages");

  const res = await pw.documents.migrateComments("doc_2", {
    fromDocumentId: "doc_1",
  });
  assert.equal(res.status, "queued");
  assert.equal(
    calls[1]?.url,
    "http://api.test/v1/documents/doc_2/migrate-comments",
  );
  assert.deepEqual(calls[1]?.body, { fromDocumentId: "doc_1" });
});

// ── Template proposals (Pillar 2, V2-B06) ────────────────────────────────────────

test("templates.proposals.open posts the candidate body under the template", async () => {
  const { fetch, calls } = mockFetch([
    json(202, {
      id: "prop_1",
      templateId: "tmpl_x",
      status: "open",
      checkStatus: "pending",
      baseVersion: 7,
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const prop = await pw.templates.proposals.open("tmpl_x", {
    fromDraft: true,
    note: "tweak footer",
  });

  assert.equal(prop.id, "prop_1");
  assert.equal(prop.status, "open");
  assert.equal(prop.checkStatus, "pending");
  const call = calls[0];
  assert.equal(call?.url, "http://api.test/v1/templates/tmpl_x/proposals");
  assert.equal(call?.method, "POST");
  assert.equal(call?.headers["x-api-key"], "pk_test_abc");
  assert.deepEqual(call?.body, { fromDraft: true, note: "tweak footer" });
});

test("templates.proposals.list forwards status + cursor as query", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { items: [], nextCursor: null }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const page = await pw.templates.proposals.list("tmpl_x", {
    status: "open",
    limit: 10,
  });

  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
  assert.equal(
    calls[0]?.url,
    "http://api.test/v1/templates/tmpl_x/proposals?status=open&limit=10",
  );
});

test("templates.proposals.get / rerunChecks / approve / reject / promote / retract hit the right sub-paths", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      id: "prop_1",
      status: "open",
      gate: { promotable: false, blockReason: "approvals 0/2" },
    }),
    json(202, { id: "prop_1", checkStatus: "pending" }),
    json(201, { id: "prop_1", status: "open" }),
    json(201, { id: "prop_1", status: "rejected" }),
    json(200, { promotedVersion: 8 }),
    json(200, { ok: true }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const got = await pw.templates.proposals.get("tmpl_x", "prop_1");
  assert.equal(got.gate?.promotable, false);
  assert.equal(
    calls[0]?.url,
    "http://api.test/v1/templates/tmpl_x/proposals/prop_1",
  );

  await pw.templates.proposals.rerunChecks("tmpl_x", "prop_1", {
    regressionMode: "strict",
    checks: ["page_count", "text_diff"],
    minSuccessfulFixtures: 2,
    failOnErrors: true,
  });
  assert.equal(
    calls[1]?.url,
    "http://api.test/v1/templates/tmpl_x/proposals/prop_1/checks",
  );
  assert.equal(calls[1]?.method, "POST");
  assert.deepEqual(calls[1]?.body, {
    regressionMode: "strict",
    checks: ["page_count", "text_diff"],
    minSuccessfulFixtures: 2,
    failOnErrors: true,
  });

  await pw.templates.proposals.approve("tmpl_x", "prop_1", {
    approverUserId: "usr_2",
  });
  assert.equal(
    calls[2]?.url,
    "http://api.test/v1/templates/tmpl_x/proposals/prop_1/approve",
  );
  assert.deepEqual(calls[2]?.body, { approverUserId: "usr_2" });

  await pw.templates.proposals.reject("tmpl_x", "prop_1", { note: "not yet" });
  assert.equal(
    calls[3]?.url,
    "http://api.test/v1/templates/tmpl_x/proposals/prop_1/reject",
  );

  const promoted = await pw.templates.proposals.promote("tmpl_x", "prop_1");
  assert.equal(promoted.promotedVersion, 8);
  assert.equal(
    calls[4]?.url,
    "http://api.test/v1/templates/tmpl_x/proposals/prop_1/promote",
  );

  const retracted = await pw.templates.proposals.retract("tmpl_x", "prop_1");
  assert.equal(retracted.ok, true);
  assert.equal(calls[5]?.method, "DELETE");
  assert.equal(
    calls[5]?.url,
    "http://api.test/v1/templates/tmpl_x/proposals/prop_1",
  );
});

// ── Environments & pins (Pillar 2, V2-B06) ───────────────────────────────────────

test("environments.list / create / get / update / delete hit /v1/environments", async () => {
  const { fetch, calls } = mockFetch([
    json(200, [
      {
        id: "env_1",
        name: "Production",
        slug: "production",
        isProduction: true,
        pinCount: 2,
      },
    ]),
    json(201, {
      id: "env_2",
      name: "Staging",
      slug: "staging",
      isProduction: false,
      pinCount: 0,
    }),
    json(200, {
      id: "env_2",
      name: "Staging",
      slug: "staging",
      isProduction: false,
      pinCount: 0,
    }),
    json(200, {
      id: "env_2",
      name: "Stage",
      slug: "staging",
      isProduction: false,
      pinCount: 0,
    }),
    json(200, { deleted: true }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const envs = await pw.environments.list();
  assert.equal(envs[0]?.slug, "production");
  assert.equal(calls[0]?.url, "http://api.test/v1/environments");

  await pw.environments.create({ name: "Staging", slug: "staging" });
  assert.equal(calls[1]?.method, "POST");
  assert.deepEqual(calls[1]?.body, { name: "Staging", slug: "staging" });

  await pw.environments.get("staging");
  assert.equal(calls[2]?.url, "http://api.test/v1/environments/staging");

  await pw.environments.update("staging", { name: "Stage" });
  assert.equal(calls[3]?.method, "PATCH");

  const del = await pw.environments.delete("staging");
  assert.equal(del.deleted, true);
  assert.equal(calls[4]?.method, "DELETE");
});

test("environments.pins / setPin / removePin / promote hit the pin sub-paths", async () => {
  const { fetch, calls } = mockFetch([
    json(200, [
      {
        templateId: "tmpl_x",
        version: 7,
        updatedByUserId: null,
        deploymentId: null,
        updatedAt: "t",
      },
    ]),
    json(200, {
      templateId: "tmpl_x",
      version: 8,
      updatedByUserId: "usr_1",
      deploymentId: null,
      updatedAt: "t",
    }),
    json(200, { deleted: true }),
    json(200, { promoted: 2, pins: [] }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const pins = await pw.environments.pins("production");
  assert.equal(pins[0]?.version, 7);
  assert.equal(
    calls[0]?.url,
    "http://api.test/v1/environments/production/pins",
  );

  const pin = await pw.environments.setPin("production", "tmpl_x", 8);
  assert.equal(pin.version, 8);
  assert.equal(calls[1]?.method, "PUT");
  assert.equal(
    calls[1]?.url,
    "http://api.test/v1/environments/production/pins/tmpl_x",
  );
  assert.deepEqual(calls[1]?.body, { version: 8 });

  await pw.environments.removePin("production", "tmpl_x");
  assert.equal(calls[2]?.method, "DELETE");

  const res = await pw.environments.promote("production", {
    from: "staging",
    templates: ["tmpl_x"],
  });
  assert.equal(res.promoted, 2);
  assert.equal(
    calls[3]?.url,
    "http://api.test/v1/environments/production/promote",
  );
  assert.deepEqual(calls[3]?.body, { from: "staging", templates: ["tmpl_x"] });
});

test("environments.rollback posts to the rollback sub-path", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { deploymentId: "dep_new", restored: [], rolledBack: "dep_old" }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const res = await pw.environments.rollback("production", {
    toDeploymentId: "dep_old",
  });
  assert.equal(res.rolledBack, "dep_old");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(
    calls[0]?.url,
    "http://api.test/v1/environments/production/rollback",
  );
  assert.deepEqual(calls[0]?.body, { toDeploymentId: "dep_old" });
});

test("documents.create accepts an environment selector in the body", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "doc_9", status: "queued", version: 7 }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  await pw.documents.create({
    templateId: "tmpl_x",
    payload: { total: 1 },
    environment: "production",
  });

  assert.deepEqual(calls[0]?.body, {
    templateId: "tmpl_x",
    payload: { total: 1 },
    environment: "production",
  });
});

test("documents.create sends output.pdfa on the wire, including the 'none' opt-out", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "doc_a", status: "queued", version: 1 }),
    json(202, { id: "doc_b", status: "queued", version: 1 }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.documents.create({
    templateId: "tmpl_x",
    payload: { total: 1 },
    output: { pdfa: "3b" },
  });
  // "none" is the escape hatch from a template that DEFAULTS to archival output, so it must reach
  // the API rather than being treated as an absent value and dropped.
  await pw.documents.create({
    templateId: "tmpl_x",
    payload: { total: 1 },
    output: { pdfa: "none" },
  });

  assert.deepEqual(calls[0]?.body, {
    templateId: "tmpl_x",
    payload: { total: 1 },
    output: { pdfa: "3b" },
  });
  assert.deepEqual(calls[1]?.body, {
    templateId: "tmpl_x",
    payload: { total: 1 },
    output: { pdfa: "none" },
  });
});

test("documents.get surfaces the archival level and the output notices", async () => {
  const { fetch } = mockFetch([
    json(200, {
      id: "doc_a",
      status: "done",
      version: 1,
      outputFormat: "pdf",
      pdfa: "3b",
      outputNotices: ["The `Author` metadata field is not written on a PDF/A document: ..."],
    }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const doc = await pw.documents.get("doc_a");
  assert.equal(doc.pdfa, "3b");
  assert.equal(doc.outputNotices?.length, 1);
  assert.match(String(doc.outputNotices?.[0]), /Author/);
});

test("documents.create sends output.pdfUa and the conformance mode on the wire", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "doc_a", status: "queued", version: 1 }),
    json(202, { id: "doc_b", status: "queued", version: 1 }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.documents.create({
    templateId: "tmpl_x",
    payload: { total: 1 },
    output: { pdfUa: "1", conformance: "attempt" },
  });
  // Like pdfa, "none" is the escape hatch from a template that DEFAULTS to accessible output, so it
  // has to reach the API instead of being dropped as if it were absent.
  await pw.documents.create({
    templateId: "tmpl_x",
    payload: { total: 1 },
    output: { pdfUa: "none" },
  });

  assert.deepEqual(calls[0]?.body, {
    templateId: "tmpl_x",
    payload: { total: 1 },
    output: { pdfUa: "1", conformance: "attempt" },
  });
  assert.deepEqual(calls[1]?.body, {
    templateId: "tmpl_x",
    payload: { total: 1 },
    output: { pdfUa: "none" },
  });
});

test("documents.accessibility fetches the conformance report", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      standard: "PDF/UA-1",
      conformant: false,
      mode: "attempt",
      validator: "veraPDF 1.30.2",
      violations: [
        {
          source: "validator",
          rule: "ISO 14289-1:7.3-1",
          clause: "7.3 test 1",
          message: "Figure structure element has no alternate description",
          count: 2,
        },
      ],
      remediation: ["labeled 1 link annotation(s)"],
    }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const report = await pw.documents.accessibility("doc_a");
  assert.equal(calls[0]?.url, "http://api.test/v1/documents/doc_a/accessibility");
  assert.equal(report.conformant, false);
  assert.equal(report.violations?.[0]?.clause, "7.3 test 1");
  assert.equal(report.violations?.[0]?.count, 2);
});

test("documents.get surfaces the accessibility verdict", async () => {
  const { fetch } = mockFetch([
    json(200, {
      id: "doc_a",
      status: "done",
      version: 1,
      outputFormat: "pdf",
      accessibility: { standard: "PDF/UA-1", conformant: true, reportAvailable: true },
    }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const doc = await pw.documents.get("doc_a");
  assert.equal(doc.accessibility?.conformant, true);
  assert.equal(doc.accessibility?.standard, "PDF/UA-1");
});

test("deployments.plan / list / get hit /v1/deployments with the idempotency header", async () => {
  const { fetch, calls } = mockFetch([
    json(202, {
      id: "dep_1",
      status: "planned",
      environment: "production",
      source: "cli",
      sourceRef: null,
      commitSha: "9f3c1a2",
      manifestHash: "abc",
      plan: { changes: [], warnings: [] },
      createdAt: "t",
    }),
    json(200, [
      {
        id: "dep_1",
        status: "planned",
        environment: "production",
        source: "cli",
        sourceRef: null,
        commitSha: null,
        manifestHash: "abc",
        plan: { changes: [], warnings: [] },
        createdAt: "t",
      },
    ]),
    json(200, {
      id: "dep_1",
      status: "planned",
      environment: "production",
      source: "cli",
      sourceRef: null,
      commitSha: "9f3c1a2",
      manifestHash: "abc",
      plan: { changes: [], warnings: [] },
      createdAt: "t",
      resources: [],
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const plan = await pw.deployments.plan(
    {
      environment: "production",
      manifest: "apiVersion: pageweaver.io/v1",
      files: { "a.html": "<p/>" },
      commitSha: "9f3c1a2",
    },
    { idempotencyKey: "idem-42" },
  );
  assert.equal(plan.id, "dep_1");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, "http://api.test/v1/deployments/plan");
  assert.equal(calls[0]?.headers["Idempotency-Key"], "idem-42");

  const list = await pw.deployments.list({ environment: "production" });
  assert.equal(list[0]?.id, "dep_1");
  assert.equal(
    calls[1]?.url,
    "http://api.test/v1/deployments?environment=production",
  );

  const detail = await pw.deployments.get("dep_1");
  assert.deepEqual(detail.resources, []);
  assert.equal(calls[2]?.url, "http://api.test/v1/deployments/dep_1");
});

test("deployments.apply posts to the apply sub-path", async () => {
  const { fetch, calls } = mockFetch([
    json(202, {
      id: "dep_1",
      status: "applying",
      environment: "production",
      source: "cli",
      sourceRef: null,
      commitSha: "9f3c1a2",
      manifestHash: "abc",
      plan: { changes: [], warnings: [] },
      createdAt: "t",
      resources: [],
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });

  const applied = await pw.deployments.apply("dep_1");
  assert.equal(applied.status, "applying");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, "http://api.test/v1/deployments/dep_1/apply");
});

test("forms.list GETs /v1/forms", async () => {
  const { fetch, calls } = mockFetch([json(200, [])]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });
  await pw.forms.list();
  assert.equal(calls[0]?.method, "GET");
  assert.equal(calls[0]?.url, "http://api.test/v1/forms");
});

test("forms.get + forms.versions hit the right paths", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      id: "form_1",
      name: "Intake",
      slug: "intake",
      currentVersion: 2,
      templateId: "tmpl_1",
      templateVersion: 1,
      schemaId: "sch_1",
      schemaVersion: 1,
      snapshotHash: "h",
      publishedAt: "t",
      fieldContract: {
        schemaId: "sch_1",
        schemaVersion: 1,
        schema: {},
        fields: [],
      },
    }),
    json(200, []),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });
  const form = await pw.forms.get("form_1");
  assert.equal(form.fieldContract.schemaId, "sch_1");
  await pw.forms.versions("form_1");
  assert.equal(calls[0]?.url, "http://api.test/v1/forms/form_1");
  assert.equal(calls[1]?.url, "http://api.test/v1/forms/form_1/versions");
});

test("forms.get with include=source appends the query and returns the deployable source", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      id: "form_1",
      name: "Intake",
      slug: "intake",
      currentVersion: 2,
      templateId: "tmpl_1",
      templateVersion: 1,
      schemaId: "sch_1",
      schemaVersion: 1,
      snapshotHash: "h",
      publishedAt: "t",
      fieldContract: {
        schemaId: "sch_1",
        schemaVersion: 1,
        schema: {},
        fields: [],
      },
      source: {
        schemaRef: "invoice-schema",
        templateRef: "invoice",
        layout: {},
        rules: [],
        tests: null,
      },
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });
  const form = await pw.forms.get("form_1", { include: "source" });
  assert.equal(calls[0]?.url, "http://api.test/v1/forms/form_1?include=source");
  assert.equal(form.source?.schemaRef, "invoice-schema");
  assert.equal(form.source?.templateRef, "invoice");
});

test("forms.validate POSTs the data body without metering", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      valid: true,
      validationResult: { valid: true, errors: [] },
      evaluatedState: null,
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });
  const res = await pw.forms.validate("form_1", { data: { needs_nda: true } });
  assert.equal(res.valid, true);
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, "http://api.test/v1/forms/form_1/validate");
  assert.deepEqual(calls[0]?.body, { data: { needs_nda: true } });
});

test("forms.submit POSTs to the submissions sub-path and returns 202 id+status", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "sbm_1", status: "submitted" }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });
  const res = await pw.forms.submit("form_1", {
    data: { company_name: "Acme" },
  });
  assert.equal(res.id, "sbm_1");
  assert.equal(res.status, "submitted");
  assert.equal(calls[0]?.url, "http://api.test/v1/forms/form_1/submissions");
  assert.equal(calls[0]?.headers["x-api-key"], "pk_test_abc");
});

test("submissions.get GETs /v1/submissions/:id", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      id: "sbm_1",
      formId: "form_1",
      formVersion: 2,
      status: "rendered",
      dataHash: "h",
      renderJobId: "doc_9",
      validationResult: null,
      submittedAt: "t",
      createdAt: "t",
      updatedAt: "t",
    }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test_abc",
    baseUrl: "http://api.test",
    fetch,
  });
  const sub = await pw.submissions.get("sbm_1");
  assert.equal(sub.renderJobId, "doc_9");
  assert.equal(calls[0]?.url, "http://api.test/v1/submissions/sbm_1");
});

// ─── Typed errors + retry/backoff (hardening) ────────────────────────────────

test("a 404 becomes a PageWeaverNotFoundError; a 429 becomes a PageWeaverRateLimitError", async () => {
  const { PageWeaverNotFoundError, PageWeaverRateLimitError } = await import("./errors");
  {
    const { fetch } = mockFetch([json(404, { message: "not found" })]);
    const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch, retry: { maxRetries: 0 } });
    await assert.rejects(() => pw.documents.get("doc_missing"), (err: unknown) => {
      assert.ok(err instanceof PageWeaverNotFoundError);
      assert.equal((err as InstanceType<typeof PageWeaverNotFoundError>).status, 404);
      return true;
    });
  }
  {
    const { fetch } = mockFetch([
      new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "1" },
      }),
    ]);
    const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch, retry: { maxRetries: 0 } });
    await assert.rejects(() => pw.documents.get("doc_x"), (err: unknown) => {
      assert.ok(err instanceof PageWeaverRateLimitError);
      assert.equal((err as InstanceType<typeof PageWeaverRateLimitError>).retryAfterSeconds, 1);
      assert.equal((err as InstanceType<typeof PageWeaverRateLimitError>).isRetryable, true);
      return true;
    });
  }
});

test("a 402 becomes a PageWeaverPlanRequiredError (a billing problem, not a credential one)", async () => {
  const { PageWeaverPlanRequiredError, PageWeaverPermissionError } = await import("./errors");
  const { fetch } = mockFetch([
    json(402, { message: "Provenance receipts are not available on your plan. Upgrade to export receipts." }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch, retry: { maxRetries: 0 } });
  await assert.rejects(() => pw.documents.receipt("doc_1"), (err: unknown) => {
    assert.ok(err instanceof PageWeaverPlanRequiredError);
    assert.ok(!(err instanceof PageWeaverPermissionError));
    assert.equal((err as InstanceType<typeof PageWeaverPlanRequiredError>).status, 402);
    return true;
  });
});

test("a 403 scope refusal becomes a PageWeaverPermissionError with isScopeMissing + requiredScope", async () => {
  const { PageWeaverPermissionError } = await import("./errors");
  const { fetch } = mockFetch([
    json(403, {
      message: "This API key is missing the 'review' scope. Create a key with that scope to call this endpoint.",
      code: "authorization.scope_missing",
    }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch, retry: { maxRetries: 0 } });
  await assert.rejects(
    () => pw.reviews.list(),
    (err: unknown) => {
      assert.ok(err instanceof PageWeaverPermissionError);
      const perm = err as InstanceType<typeof PageWeaverPermissionError>;
      assert.equal(perm.status, 403);
      assert.equal(perm.isScopeMissing, true);
      assert.equal(perm.requiredScope, "review");
      return true;
    },
  );
});

test("a 403 with no scope_missing code is a PageWeaverPermissionError, but isScopeMissing is false", async () => {
  const { PageWeaverPermissionError } = await import("./errors");
  const { fetch } = mockFetch([json(403, { message: "This object type is not visible to your role." })]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch, retry: { maxRetries: 0 } });
  await assert.rejects(
    () => pw.objectTypes.get("obt_hidden"),
    (err: unknown) => {
      assert.ok(err instanceof PageWeaverPermissionError);
      const perm = err as InstanceType<typeof PageWeaverPermissionError>;
      assert.equal(perm.isScopeMissing, false);
      assert.equal(perm.requiredScope, undefined);
      return true;
    },
  );
});

test("a GET retries a 503 with backoff, then succeeds", async () => {
  const { fetch, calls } = mockFetch([
    new Response(JSON.stringify({ message: "unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
    json(200, { id: "doc_1", status: "done", version: 1 }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test",
    baseUrl: "http://api.test",
    fetch,
    retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 },
  });
  const doc = await pw.documents.get("doc_1");
  assert.equal(doc.status, "done");
  assert.equal(calls.length, 2);
});

test("a POST without an idempotency key is never retried on 503", async () => {
  const { fetch } = mockFetch([
    new Response(JSON.stringify({ message: "unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  await assert.rejects(() =>
    pw.documents.create({ templateId: "tmpl_invoice", payload: {} }),
  );
});

test("a POST WITH an idempotency key is retried on 503", async () => {
  const { fetch, calls } = mockFetch([
    new Response(JSON.stringify({ message: "unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
    json(202, { id: "doc_1", status: "queued", version: 1 }),
  ]);
  const pw = new PageWeaver({
    apiKey: "pk_test",
    baseUrl: "http://api.test",
    fetch,
    retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2 },
  });
  const res = await pw.documents.create({
    templateId: "tmpl_invoice",
    payload: {},
    idempotencyKey: "idem-1",
  });
  assert.equal(res.id, "doc_1");
  assert.equal(calls.length, 2);
});

// ─── Client-side request validation (no network call) ────────────────────────

test("validation: a blank id is rejected before any request is sent", async () => {
  const { PageWeaverInvalidRequestError } = await import("./errors");
  const { fetch, calls } = mockFetch([]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  // These throw synchronously (the check runs before any network call), so assert.throws applies —
  // not assert.rejects, which only inspects a promise's eventual rejection.
  assert.throws(() => pw.documents.get(""), PageWeaverInvalidRequestError);
  assert.throws(() => pw.objects.get("   "), PageWeaverInvalidRequestError);
  assert.equal(calls.length, 0);
});

test("validation: objects.create requires exactly one of objectTypeKey/objectTypeId", async () => {
  const { PageWeaverInvalidRequestError } = await import("./errors");
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch: mockFetch([]).fetch });
  assert.throws(
    () => pw.objects.create({ data: { a: 1 } } as Parameters<typeof pw.objects.create>[0]),
    PageWeaverInvalidRequestError,
  );
  assert.throws(
    () =>
      pw.objects.create({
        objectTypeKey: "invoice",
        objectTypeId: "obt_1",
        data: { a: 1 },
      }),
    PageWeaverInvalidRequestError,
  );
});

test("validation: objects.replace requires a positive integer expectedVersion", async () => {
  const { PageWeaverInvalidRequestError } = await import("./errors");
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch: mockFetch([]).fetch });
  assert.throws(
    () =>
      pw.objects.replace(
        "obj_1",
        { data: { a: 1 } } as unknown as Parameters<typeof pw.objects.replace>[1],
      ),
    PageWeaverInvalidRequestError,
  );
});

// ─── Object types / objects / relationship types ─────────────────────────────

test("objectTypes.create posts to /v1/object-types and get/publish round-trip", async () => {
  const { fetch, calls } = mockFetch([
    json(201, { id: "obt_1", key: "invoice", nameSingular: "Invoice", namePlural: "Invoices", status: "draft" }),
    json(200, { objectTypeId: "obt_1", version: 1, snapshotHash: "h", unchanged: false, policies: { fields: {}, sensitivePaths: [] } }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const created = await pw.objectTypes.create({
    key: "invoice",
    nameSingular: "Invoice",
    namePlural: "Invoices",
  });
  assert.equal(created.id, "obt_1");
  const published = await pw.objectTypes.publish("obt_1", { note: "initial" });
  assert.equal(published.version, 1);
  assert.equal(calls[0]?.url, "http://api.test/v1/object-types");
  assert.equal(calls[1]?.url, "http://api.test/v1/object-types/obt_1/publish");
});

test("objects.create sends the Idempotency-Key header and strips it from the body", async () => {
  const { fetch, calls } = mockFetch([
    json(201, { id: "obj_1", objectTypeId: "obt_1", number: "INV-1", version: 1, status: "active" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const obj = await pw.objects.create({
    objectTypeKey: "invoice",
    data: { total: 42 },
    idempotencyKey: "idem-obj-1",
  });
  assert.equal(obj.id, "obj_1");
  assert.equal(calls[0]?.headers["idempotency-key"], "idem-obj-1");
  assert.deepEqual(calls[0]?.body, { objectTypeKey: "invoice", data: { total: 42 } });
});

test("objects.replace sends If-Match + expectedVersion and replaces the whole value", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { id: "obj_1", objectTypeId: "obt_1", number: "INV-1", version: 2, status: "active" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const obj = await pw.objects.replace("obj_1", { data: { total: 99 }, expectedVersion: 1 });
  assert.equal(obj.version, 2);
  assert.equal(calls[0]?.method, "PUT");
  assert.equal(calls[0]?.headers["if-match"], "1");
  assert.deepEqual(calls[0]?.body, { data: { total: 99 }, expectedVersion: 1 });
});

test("objects.addRelationship / endRelationship / linkDocument hit the sub-paths", async () => {
  const { fetch, calls } = mockFetch([
    json(201, {
      id: "rel_1", relationshipTypeId: "rt_1", relationshipTypeKey: "invoices",
      label: "invoices", inverseLabel: "invoiced by", sourceObjectId: "obj_1", targetObjectId: "obj_2",
      metadata: null, validFrom: "t", validTo: null, endReason: null, unchanged: false,
    }),
    json(200, {
      id: "rel_1", relationshipTypeId: "rt_1", relationshipTypeKey: "invoices",
      label: "invoices", inverseLabel: "invoiced by", sourceObjectId: "obj_1", targetObjectId: "obj_2",
      metadata: null, validFrom: "t", validTo: "t2", endReason: "done", unchanged: false,
    }),
    json(201, { id: "lnk_1", documentId: "doc_1", businessObjectId: "obj_1", role: "primary", createdAt: "t", unchanged: false }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  await pw.objects.addRelationship("obj_1", { relationshipTypeKey: "invoices", targetObjectId: "obj_2" });
  await pw.objects.endRelationship("obj_1", "rel_1", { reason: "done" });
  await pw.objects.linkDocument("obj_1", { documentId: "doc_1" });
  assert.equal(calls[0]?.url, "http://api.test/v1/objects/obj_1/relationships");
  assert.equal(calls[1]?.url, "http://api.test/v1/objects/obj_1/relationships/rel_1/end");
  assert.equal(calls[2]?.url, "http://api.test/v1/objects/obj_1/documents");
});

test("relationshipTypes.create requires inverseLabel and posts to /v1/relationship-types", async () => {
  const { PageWeaverInvalidRequestError } = await import("./errors");
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch: mockFetch([]).fetch });
  assert.throws(
    () =>
      pw.relationshipTypes.create({
        key: "invoices",
        label: "invoices",
      } as Parameters<typeof pw.relationshipTypes.create>[0]),
    PageWeaverInvalidRequestError,
  );

  const { fetch, calls } = mockFetch([
    json(201, {
      id: "rt_1", key: "invoices", label: "invoices", inverseLabel: "invoiced by",
      description: null, sourceTypeKeys: [], targetTypeKeys: [], cardinality: "many_to_many",
      status: "active", createdAt: "t", updatedAt: "t",
    }),
  ]);
  const pw2 = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const rt = await pw2.relationshipTypes.create({
    key: "invoices",
    label: "invoices",
    inverseLabel: "invoiced by",
  });
  assert.equal(rt.id, "rt_1");
  assert.equal(calls[0]?.url, "http://api.test/v1/relationship-types");
});

// ─── Search / events ───────────────────────────────────────────────────────

test("search.query requires q and forwards filters as query params", async () => {
  const { PageWeaverInvalidRequestError } = await import("./errors");
  const pw0 = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch: mockFetch([]).fetch });
  assert.throws(
    () => pw0.search.query({ q: "" }),
    PageWeaverInvalidRequestError,
  );

  const { fetch, calls } = mockFetch([json(200, { items: [], nextCursor: null })]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  await pw.search.query({ q: "acme invoice", subjectType: "object", limit: 10 });
  assert.equal(
    calls[0]?.url,
    "http://api.test/v1/search?q=acme+invoice&subjectType=object&limit=10",
  );
});

test("events.list forwards after/type/limit as query params", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { events: [], nextCursor: "42", latestSeq: "100" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const page = await pw.events.list({ after: "10", type: "document.completed", limit: 5 });
  assert.equal(page.nextCursor, "42");
  assert.equal(calls[0]?.url, "http://api.test/v1/events?after=10&limit=5&type=document.completed");
});

test("events.listAll follows nextCursor until a page comes back empty", async () => {
  const { fetch } = mockFetch([
    json(200, { events: [{ id: "e1", seq: "1", type: "t", version: 1, subjectType: null, subjectId: null, payload: {}, correlationId: null, at: "t" }], nextCursor: "1", latestSeq: "2" }),
    json(200, { events: [], nextCursor: null, latestSeq: "2" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const seen: string[] = [];
  for await (const event of pw.events.listAll()) seen.push(event.id);
  assert.deepEqual(seen, ["e1"]);
});

// ─── Document lineage: trust, diff, versions, representations ───────────────

test("documents.trust / diff / appendVersion / versions / representations hit the right sub-paths", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { documentId: "doc_1", status: "done", schemaId: null, schemaVersion: null, templateId: "tmpl_1", version: 1, artifactHash: "h", contentHash: "c", hashAlg: "sha256", chainSeq: 1, chainVerified: true, signature: null }),
    json(200, {
      a: { documentId: "doc_1", status: "done" }, b: { documentId: "doc_2", status: "done" },
      classification: "payload_only", payload: { comparable: true, changes: [] },
      template: { comparable: true, changed: false, templateIdA: "t", templateIdB: "t", versionA: 1, versionB: 1 },
      optionsDelta: [], pageDelta: 0, integrity: { contentHashA: "a", contentHashB: "b", identical: false },
    }),
    json(202, { documentId: "doc_1", document: { id: "doc_3", status: "queued" } }),
    json(200, { documentId: "doc_1", versions: [] }),
    json(200, { documentId: "doc_1", documentVersion: 1, representations: [] }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  await pw.documents.trust("doc_1");
  await pw.documents.diff("doc_1", "doc_2");
  await pw.documents.appendVersion("doc_1", { payload: { total: 1 } });
  await pw.documents.versions("doc_1");
  await pw.documents.representations("doc_1", { version: 1 });
  assert.equal(calls[0]?.url, "http://api.test/v1/documents/doc_1/trust");
  assert.equal(calls[1]?.url, "http://api.test/v1/documents/doc_1/diff?against=doc_2");
  assert.equal(calls[2]?.url, "http://api.test/v1/documents/doc_1/versions");
  assert.equal(calls[2]?.method, "POST");
  assert.equal(calls[3]?.url, "http://api.test/v1/documents/doc_1/versions");
  assert.equal(calls[3]?.method, "GET");
  assert.equal(calls[4]?.url, "http://api.test/v1/documents/doc_1/representations?version=1");
});

// ─── Document intake / upload ────────────────────────────────────────────────

test("intake.create sends a multipart request with no content-type header set manually", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "doc_1", status: "done", version: 1, bytes: 100, pages: 1, contentHash: "h", classification: "internal" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const res = await pw.intake.create({
    file: { data: new Uint8Array([1, 2, 3]), filename: "doc.pdf", contentType: "application/pdf" },
    classification: "internal",
  });
  assert.equal(res.id, "doc_1");
  assert.equal(calls[0]?.url, "http://api.test/v1/documents/intake");
  assert.equal(calls[0]?.method, "POST");
  // multipart bodies never set a JSON content-type header manually
  assert.equal(calls[0]?.headers["content-type"], undefined);
});

test("intake.sessions create/get/uploadChunk/finalize hit the right sub-paths", async () => {
  const { fetch, calls } = mockFetch([
    json(201, {
      id: "ups_1", status: "open", filename: "doc.pdf", mediaType: "application/pdf",
      totalBytes: 100, chunkSize: 50, totalChunks: 2, receivedChunks: [], receivedBytes: 0,
      objectId: null, objectRole: null, classification: "internal", documentId: null,
      errorMessage: null, isTest: false, createdByApiKeyId: null, captureBatchId: null,
      expiresAt: "t", finalizedAt: null, createdAt: "t",
    }),
    json(200, { id: "ups_1", status: "open", filename: "doc.pdf", mediaType: "application/pdf", totalBytes: 100, chunkSize: 50, totalChunks: 2, receivedChunks: [0], receivedBytes: 50, objectId: null, objectRole: null, classification: "internal", documentId: null, errorMessage: null, isTest: false, createdByApiKeyId: null, captureBatchId: null, expiresAt: "t", finalizedAt: null, createdAt: "t" }),
    json(202, { id: "doc_1", status: "done", version: 1, bytes: 100, pages: 1, contentHash: "h", classification: "internal" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const session = await pw.intake.sessions.create({
    filename: "doc.pdf",
    totalBytes: 100,
    chunkSize: 50,
  });
  assert.equal(session.id, "ups_1");
  await pw.intake.sessions.uploadChunk("ups_1", 0, new Uint8Array([1, 2]));
  const result = await pw.intake.sessions.finalize("ups_1");
  assert.equal((result as { id: string }).id, "doc_1");
  assert.equal(calls[0]?.url, "http://api.test/v1/documents/intake/sessions");
  assert.equal(calls[1]?.url, "http://api.test/v1/documents/intake/sessions/ups_1/chunks/0");
  assert.equal(calls[1]?.method, "PUT");
  assert.equal(calls[2]?.url, "http://api.test/v1/documents/intake/sessions/ups_1/finalize");
});

// ─── Fillable AcroForm templates ──────────────────────────────────────────────

test("formTemplates.create uploads multipart with name/description fields", async () => {
  const { fetch, calls } = mockFetch([
    json(201, { id: "fmt_1", version: { version: 1, bytes: 10, pages: 1, fieldCount: 3, contentHash: "h", createdAt: "t" } }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const res = await pw.formTemplates.create({
    name: "Claim form",
    description: "Insurance claim",
    file: { data: new Uint8Array([1]), filename: "claim.pdf" },
  });
  assert.equal(res.id, "fmt_1");
  assert.equal(calls[0]?.url, "http://api.test/v1/form-templates");
  assert.equal(calls[0]?.headers["content-type"], undefined);
});

test("formTemplates.fill posts the payload and version", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { documentId: "doc_1", status: "done", version: 1, bytes: 10, pages: 1, contentHash: "h" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const res = await pw.formTemplates.fill("fmt_1", { payload: { "claimant.fullName": "Ada" }, version: 2 });
  assert.equal(res.documentId, "doc_1");
  assert.equal(calls[0]?.url, "http://api.test/v1/form-templates/fmt_1/fill");
  assert.deepEqual(calls[0]?.body, { payload: { "claimant.fullName": "Ada" }, version: 2 });
});

// ─── Error codes / workflow definitions ───────────────────────────────────────

test("errorCodes.list fetches /v1/errors without the x-api-key header", async () => {
  const { fetch, calls } = mockFetch([json(200, { domains: ["formtemplate"], codes: [] })]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  const catalog = await pw.errorCodes.list();
  assert.deepEqual(catalog.domains, ["formtemplate"]);
  assert.equal(calls[0]?.headers["x-api-key"], undefined);
});

test("workflowDefinitions.list / get / versions hit the right paths", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { items: [], nextCursor: null }),
    json(200, { id: "wfd_1", key: "onboarding", name: "Onboarding", status: "published", currentVersion: 1, hasUnpublishedChanges: false, createdAt: "t", updatedAt: "t", draftSpec: {} }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test", baseUrl: "http://api.test", fetch });
  await pw.workflowDefinitions.list();
  await pw.workflowDefinitions.get("wfd_1");
  assert.equal(calls[0]?.url, "http://api.test/v1/workflow-definitions");
  assert.equal(calls[1]?.url, "http://api.test/v1/workflow-definitions/wfd_1");
});
