import assert from "node:assert/strict";
import { test } from "node:test";
import { PageWeaver } from "./client";
import { PageWeaverApiError, PageWeaverDocumentFailedError } from "./errors";
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
function mockFetch(responses: Response[]): { fetch: FetchLike; calls: Recorded[] } {
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
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("documents.create posts with auth + idempotency header and strips it from the body", async () => {
  const { fetch, calls } = mockFetch([json(202, { id: "doc_1", status: "queued", version: 3 })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

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
  assert.deepEqual(call.body, { templateId: "tmpl_invoice", payload: { total: 42 }, version: 3 });
});

test("documents.createSync defaults to JSON with the download url (no Accept: application/pdf)", async () => {
  const { fetch, calls } = mockFetch([
    json(200, {
      id: "doc_sync",
      status: "done",
      version: 2,
      download: { protected: false, requiresPassword: false, url: "http://cdn.test/doc_sync.pdf" },
    }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const out = await pw.documents.createSync({ templateId: "t", payload: { a: 1 } });

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
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const out = await pw.documents.createSync({ templateId: "t", payload: { a: 1 } }, { pdf: true });

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

test("documents.createSync falls back to a pending result when the wait deadline is exceeded", async () => {
  const { fetch } = mockFetch([json(202, { id: "doc_slow", status: "rendering", version: 1 })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

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
      download: { protected: true, requiresPassword: true, url: "http://api.test/v1/documents/doc_prot/content" },
    }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const out = await pw.documents.createSync({ templateId: "t", payload: {} }, { pdf: true });

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
      download: { protected: false, requiresPassword: false, url: "http://cdn.test/doc_2.pdf" },
    }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

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
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await assert.rejects(
    () => pw.documents.waitFor("doc_3", { intervalMs: 1 }),
    (err: unknown) => {
      assert.ok(err instanceof PageWeaverDocumentFailedError);
      assert.equal(err.document.error, "boom");
      return true;
    },
  );
});

test("a non-2xx response becomes a PageWeaverApiError carrying status + errors", async () => {
  const { fetch } = mockFetch([
    json(400, { message: "Payload failed validation", errors: [{ path: "/total" }] }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await assert.rejects(
    () => pw.documents.create({ templateId: "t", payload: {} }),
    (err: unknown) => {
      assert.ok(err instanceof PageWeaverApiError);
      assert.equal(err.status, 400);
      assert.equal(err.message, "Payload failed validation");
      assert.deepEqual(err.errors, [{ path: "/total" }]);
      return true;
    },
  );
});

test("documents.list serializes query params", async () => {
  const { fetch, calls } = mockFetch([json(200, { items: [], nextCursor: null })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.documents.list({ status: "done", limit: 5, templateId: "t" });

  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "http://api.test/v1/documents?status=done&templateId=t&limit=5");
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
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const result = await pw.documents.verify("doc_9");

  assert.equal(result.contentHash, "abc123");
  assert.equal(result.chainVerified, true);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "http://api.test/v1/documents/doc_9/verify");
  assert.equal(call.headers["x-api-key"], "pk_test_abc");
});

test("documents.download with a password hits the content endpoint without the API key", async () => {
  const pdf = new Uint8Array([37, 80, 68, 70]); // %PDF
  const { fetch, calls } = mockFetch([new Response(pdf, { status: 200 })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

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
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.templates.versions("tmpl_1");

  assert.equal(calls[0]?.url, "http://api.test/v1/templates/tmpl_1/versions");
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
