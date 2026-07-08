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

test("documents.proofPack GETs the proof sub-path as bytes with Accept: application/zip", async () => {
  const zip = new Uint8Array([80, 75, 3, 4]); // PK\x03\x04
  const { fetch, calls } = mockFetch([
    new Response(zip, { status: 200, headers: { "content-type": "application/zip" } }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const out = await pw.documents.proofPack("doc_1");

  assert.deepEqual(out, zip);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.method, "GET");
  assert.equal(call.url, "http://api.test/v1/documents/doc_1/proof");
  assert.equal(call.headers["accept"], "application/zip");
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

test("templates.version fetches one version with include=source", async () => {
  const { fetch, calls } = mockFetch([json(200, { version: 3, editorMode: "code", source: {} })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.templates.version("tmpl_1", 3, { include: "source" });

  assert.equal(calls[0]?.url, "http://api.test/v1/templates/tmpl_1/versions/3?include=source");
});

test("schemas.version fetches one version with include=nodes", async () => {
  const { fetch, calls } = mockFetch([json(200, { version: 2, nodes: [] })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.schemas.version("schema_1", 2, { include: "nodes" });

  assert.equal(calls[0]?.url, "http://api.test/v1/schemas/schema_1/versions/2?include=nodes");
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
    json(201, { id: "cth_1", documentId: "doc_1", anchorType: "point", status: "open" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

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
  const { fetch, calls } = mockFetch([json(200, { items: [], nextCursor: null })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.comments.list({ documentId: "doc_1", status: "open", pageNumber: 2 });

  const call = calls[0];
  assert.ok(call);
  assert.equal(call.method, "GET");
  assert.equal(call.url, "http://api.test/v1/documents/doc_1/comments?pageNumber=2&status=open");
});

test("comments.resolve posts to the resolve sub-path", async () => {
  const { fetch, calls } = mockFetch([json(200, { id: "cth_1", status: "resolved" })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const thread = await pw.comments.resolve("cth_1");

  assert.equal(thread.status, "resolved");
  assert.equal(calls[0]?.url, "http://api.test/v1/comments/cth_1/resolve");
  assert.equal(calls[0]?.method, "POST");
});

test("reviews.create posts to /v1/reviews with policy + participants", async () => {
  const { fetch, calls } = mockFetch([json(201, { id: "rev_1", documentId: "doc_1", status: "open" })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

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
  const { fetch, calls } = mockFetch([json(201, { id: "rev_1", status: "completed" })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.reviews.approve("rev_1", { decision: "approved", note: "LGTM" });

  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "http://api.test/v1/reviews/rev_1/approvals");
  assert.deepEqual(call.body, { decision: "approved", note: "LGTM" });
});

test("reviews.list forwards status + documentId as query params", async () => {
  const { fetch, calls } = mockFetch([json(200, { items: [], nextCursor: null })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.reviews.list({ status: "open", documentId: "doc_1" });

  assert.equal(calls[0]?.url, "http://api.test/v1/reviews?status=open&documentId=doc_1");
});

test("shareLinks.create returns the raw url/token once", async () => {
  const { fetch, calls } = mockFetch([
    json(201, { id: "shl_1", url: "http://portal/r/tok", token: "tok", targetType: "render" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

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
  const { fetch, calls } = mockFetch([json(200, { id: "shl_1", disabledAt: "2026-07-06T00:00:00Z" })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.shareLinks.disable("shl_1");

  assert.equal(calls[0]?.url, "http://api.test/v1/share-links/shl_1/disable");
  assert.equal(calls[0]?.method, "POST");
});

test("documents.pages + migrateComments hit the document sub-paths", async () => {
  const { fetch, calls } = mockFetch([
    json(200, [{ pageNumber: 1, widthPts: 612, heightPts: 792, hasText: true, hasThumbnail: true }]),
    json(202, { status: "queued" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const pages = await pw.documents.pages("doc_1");
  assert.equal(pages[0]?.pageNumber, 1);
  assert.equal(calls[0]?.url, "http://api.test/v1/documents/doc_1/pages");

  const res = await pw.documents.migrateComments("doc_2", { fromDocumentId: "doc_1" });
  assert.equal(res.status, "queued");
  assert.equal(calls[1]?.url, "http://api.test/v1/documents/doc_2/migrate-comments");
  assert.deepEqual(calls[1]?.body, { fromDocumentId: "doc_1" });
});

// ── Template proposals (Pillar 2, V2-B06) ────────────────────────────────────────

test("templates.proposals.open posts the candidate body under the template", async () => {
  const { fetch, calls } = mockFetch([
    json(202, { id: "prop_1", templateId: "tmpl_x", status: "open", checkStatus: "pending", baseVersion: 7 }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const prop = await pw.templates.proposals.open("tmpl_x", { fromDraft: true, note: "tweak footer" });

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
  const { fetch, calls } = mockFetch([json(200, { items: [], nextCursor: null })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const page = await pw.templates.proposals.list("tmpl_x", { status: "open", limit: 10 });

  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
  assert.equal(calls[0]?.url, "http://api.test/v1/templates/tmpl_x/proposals?status=open&limit=10");
});

test("templates.proposals.get / rerunChecks / approve / reject / promote / retract hit the right sub-paths", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { id: "prop_1", status: "open", gate: { promotable: false, blockReason: "approvals 0/2" } }),
    json(202, { id: "prop_1", checkStatus: "pending" }),
    json(201, { id: "prop_1", status: "open" }),
    json(201, { id: "prop_1", status: "rejected" }),
    json(200, { promotedVersion: 8 }),
    json(200, { ok: true }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const got = await pw.templates.proposals.get("tmpl_x", "prop_1");
  assert.equal(got.gate?.promotable, false);
  assert.equal(calls[0]?.url, "http://api.test/v1/templates/tmpl_x/proposals/prop_1");

  await pw.templates.proposals.rerunChecks("tmpl_x", "prop_1");
  assert.equal(calls[1]?.url, "http://api.test/v1/templates/tmpl_x/proposals/prop_1/checks");
  assert.equal(calls[1]?.method, "POST");

  await pw.templates.proposals.approve("tmpl_x", "prop_1", { approverUserId: "usr_2" });
  assert.equal(calls[2]?.url, "http://api.test/v1/templates/tmpl_x/proposals/prop_1/approve");
  assert.deepEqual(calls[2]?.body, { approverUserId: "usr_2" });

  await pw.templates.proposals.reject("tmpl_x", "prop_1", { note: "not yet" });
  assert.equal(calls[3]?.url, "http://api.test/v1/templates/tmpl_x/proposals/prop_1/reject");

  const promoted = await pw.templates.proposals.promote("tmpl_x", "prop_1");
  assert.equal(promoted.promotedVersion, 8);
  assert.equal(calls[4]?.url, "http://api.test/v1/templates/tmpl_x/proposals/prop_1/promote");

  const retracted = await pw.templates.proposals.retract("tmpl_x", "prop_1");
  assert.equal(retracted.ok, true);
  assert.equal(calls[5]?.method, "DELETE");
  assert.equal(calls[5]?.url, "http://api.test/v1/templates/tmpl_x/proposals/prop_1");
});

// ── Environments & pins (Pillar 2, V2-B06) ───────────────────────────────────────

test("environments.list / create / get / update / delete hit /v1/environments", async () => {
  const { fetch, calls } = mockFetch([
    json(200, [{ id: "env_1", name: "Production", slug: "production", isProduction: true, pinCount: 2 }]),
    json(201, { id: "env_2", name: "Staging", slug: "staging", isProduction: false, pinCount: 0 }),
    json(200, { id: "env_2", name: "Staging", slug: "staging", isProduction: false, pinCount: 0 }),
    json(200, { id: "env_2", name: "Stage", slug: "staging", isProduction: false, pinCount: 0 }),
    json(200, { deleted: true }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

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
    json(200, [{ templateId: "tmpl_x", version: 7, updatedByUserId: null, deploymentId: null, updatedAt: "t" }]),
    json(200, { templateId: "tmpl_x", version: 8, updatedByUserId: "usr_1", deploymentId: null, updatedAt: "t" }),
    json(200, { deleted: true }),
    json(200, { promoted: 2, pins: [] }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const pins = await pw.environments.pins("production");
  assert.equal(pins[0]?.version, 7);
  assert.equal(calls[0]?.url, "http://api.test/v1/environments/production/pins");

  const pin = await pw.environments.setPin("production", "tmpl_x", 8);
  assert.equal(pin.version, 8);
  assert.equal(calls[1]?.method, "PUT");
  assert.equal(calls[1]?.url, "http://api.test/v1/environments/production/pins/tmpl_x");
  assert.deepEqual(calls[1]?.body, { version: 8 });

  await pw.environments.removePin("production", "tmpl_x");
  assert.equal(calls[2]?.method, "DELETE");

  const res = await pw.environments.promote("production", { from: "staging", templates: ["tmpl_x"] });
  assert.equal(res.promoted, 2);
  assert.equal(calls[3]?.url, "http://api.test/v1/environments/production/promote");
  assert.deepEqual(calls[3]?.body, { from: "staging", templates: ["tmpl_x"] });
});

test("environments.rollback posts to the rollback sub-path", async () => {
  const { fetch, calls } = mockFetch([
    json(200, { deploymentId: "dep_new", restored: [], rolledBack: "dep_old" }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const res = await pw.environments.rollback("production", { toDeploymentId: "dep_old" });
  assert.equal(res.rolledBack, "dep_old");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, "http://api.test/v1/environments/production/rollback");
  assert.deepEqual(calls[0]?.body, { toDeploymentId: "dep_old" });
});

test("documents.create accepts an environment selector in the body", async () => {
  const { fetch, calls } = mockFetch([json(202, { id: "doc_9", status: "queued", version: 7 })]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  await pw.documents.create({ templateId: "tmpl_x", payload: { total: 1 }, environment: "production" });

  assert.deepEqual(calls[0]?.body, { templateId: "tmpl_x", payload: { total: 1 }, environment: "production" });
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
    json(200, [{ id: "dep_1", status: "planned", environment: "production", source: "cli", sourceRef: null, commitSha: null, manifestHash: "abc", plan: { changes: [], warnings: [] }, createdAt: "t" }]),
    json(200, { id: "dep_1", status: "planned", environment: "production", source: "cli", sourceRef: null, commitSha: "9f3c1a2", manifestHash: "abc", plan: { changes: [], warnings: [] }, createdAt: "t", resources: [] }),
  ]);
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const plan = await pw.deployments.plan(
    { environment: "production", manifest: "apiVersion: pageweaver.io/v1", files: { "a.html": "<p/>" }, commitSha: "9f3c1a2" },
    { idempotencyKey: "idem-42" },
  );
  assert.equal(plan.id, "dep_1");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, "http://api.test/v1/deployments/plan");
  assert.equal(calls[0]?.headers["Idempotency-Key"], "idem-42");

  const list = await pw.deployments.list({ environment: "production" });
  assert.equal(list[0]?.id, "dep_1");
  assert.equal(calls[1]?.url, "http://api.test/v1/deployments?environment=production");

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
  const pw = new PageWeaver({ apiKey: "pk_test_abc", baseUrl: "http://api.test", fetch });

  const applied = await pw.deployments.apply("dep_1");
  assert.equal(applied.status, "applying");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, "http://api.test/v1/deployments/dep_1/apply");
});
