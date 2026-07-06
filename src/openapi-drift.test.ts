import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Drift guard: assert the SDK's assumptions still match the API's actual OpenAPI spec.
//
// `openapi.json` is the source of truth; the SDK types are hand-written. This test pins the endpoints
// the SDK calls and the request-body property sets it models against a committed snapshot of the live
// spec (src/__fixtures__/openapi.snapshot.json). When the API surface changes, refresh the snapshot with
// `pnpm --filter @pageweaver/sdk sync:openapi` and re-run: a failure here means the hand-written types
// (src/types.ts) and the EXPECTED_* maps below need updating to match.
//
// Scope note: NestJS emits request bodies + parameters into the spec, but the controllers don't declare
// typed `@ApiResponse`s, so response schemas are absent from the spec. Response shapes are therefore
// covered by the hand-written types plus the mocked unit tests in sdk.test.ts, not by this guard.

interface OpenApiSpec {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
}

const spec = loadSpec();

/** Every endpoint the SDK calls, as `METHOD path`. Kept exhaustive so a NEW public path fails the test. */
const EXPECTED_ENDPOINTS: string[] = [
  "post /v1/documents",
  "get /v1/documents",
  "get /v1/documents/{id}",
  "get /v1/documents/{id}/verify",
  "post /v1/documents/{id}/regenerate",
  "get /v1/documents/{id}/content",
  "get /v1/templates",
  "get /v1/templates/{id}",
  "get /v1/templates/{id}/versions",
  "get /v1/schemas",
  "get /v1/schemas/{id}",
  "get /v1/schemas/{id}/versions",
  "get /v1/usage",
  // Review layer (V2-A07): comments, reviews, share links, document pages + comment migration.
  "post /v1/comments",
  "get /v1/comments/{id}",
  "patch /v1/comments/{id}",
  "post /v1/comments/{id}/messages",
  "post /v1/comments/{id}/resolve",
  "post /v1/comments/{id}/reopen",
  "post /v1/comments/{id}/close",
  "get /v1/documents/{id}/comments",
  "get /v1/documents/{id}/pages",
  "get /v1/documents/{id}/comment-migration",
  "post /v1/documents/{id}/migrate-comments",
  "post /v1/reviews",
  "get /v1/reviews",
  "get /v1/reviews/{id}",
  "post /v1/reviews/{id}/participants",
  "post /v1/reviews/{id}/approvals",
  "post /v1/reviews/{id}/complete",
  "post /v1/reviews/{id}/cancel",
  "post /v1/share-links",
  "get /v1/share-links",
  "post /v1/share-links/{id}/disable",
];

/**
 * The request-body DTO schemas and the exact property set the SDK models for each. Mirrors src/types.ts:
 *   CreateRenderDto        -> CreateDocumentParams
 *   RenderOptionsDto       -> RenderOptions
 *   Options*Dto            -> the matching sub-interface
 */
const EXPECTED_SCHEMA_PROPS: Record<string, string[]> = {
  CreateRenderDto: [
    "templateId",
    "html",
    "css",
    "url",
    "output",
    "payload",
    "version",
    "schemaId",
    "schemaVersion",
    "idempotencyKey",
    "callbackUrl",
    "options",
  ],
  OutputDto: ["format", "width", "height", "clip", "quality", "transparent", "optimizeForSpeed"],
  RenderOptionsDto: [
    "page",
    "rendering",
    "metadata",
    "header",
    "footer",
    "watermark",
    "structure",
    "localization",
    "security",
    "delivery",
  ],
  OptionsPageDto: ["size", "orientation", "margin", "scale"],
  OptionsRenderingDto: [
    "media",
    "printBackground",
    "omitBackground",
    "singlePage",
    "preferCssPageSize",
    "pageRanges",
  ],
  OptionsMetadataDto: ["title", "author", "subject", "keywords", "creator"],
  OptionsBandDto: ["enabled", "left", "center", "right", "fontSizePt", "color"],
  OptionsWatermarkDto: ["text", "pages", "fontSizePt", "color", "opacity", "rotation"],
  OptionsStructureDto: ["outline", "taggedPdf"],
  RenderLocalizationDto: ["locale", "timeZone", "currency"],
  OptionsSecurityDto: ["pdf", "signature", "download"],
  OptionsPdfSecurityDto: ["userPassword", "ownerPassword", "permissions"],
  OptionsPdfPermissionsDto: ["printing", "copying", "modifying", "annotating", "fillingForms", "assembling"],
  OptionsSignatureDto: ["enabled", "reason", "location", "contactInfo", "certSource", "timestamp"],
  OptionsDownloadSecurityDto: ["enabled", "password", "generate"],
  OptionsDeliveryDto: ["mode", "destinationIds"],
  // Review layer request DTOs (V2-A07) — mirrored by the SDK's *Params types.
  MentionDto: ["userId", "offset"],
  CreateCommentDto: [
    "documentId",
    "anchorType",
    "pageNumber",
    "x",
    "y",
    "width",
    "height",
    "selectedText",
    "textBefore",
    "textAfter",
    "textHash",
    "body",
    "severity",
    "visibility",
    "assignedToUserId",
    "dueAt",
    "mentions",
  ],
  UpdateCommentDto: ["severity", "assignedToUserId", "dueAt", "pageNumber", "x", "y", "width", "height"],
  ReplyDto: ["body", "mentions"],
  MigrateCommentsDto: ["fromDocumentId"],
  ReviewPolicyDto: [
    "requireAllCommentsResolved",
    "blockerCommentsPreventApproval",
    "requiredApproverCount",
    "allowApprovalWithOpenComments",
  ],
  ParticipantInputDto: ["userId", "externalEmail", "externalName", "role"],
  CreateReviewDto: ["documentId", "title", "message", "dueAt", "policy", "participants"],
  AddParticipantDto: ["userId", "externalEmail", "externalName", "role"],
  ApprovalDto: ["decision", "note", "approverUserId"],
  ShareLinkPermissionsDto: ["canView", "canComment", "canDownload", "canApprove", "requireEmail", "allowedDomains"],
  CreateShareLinkDto: ["targetType", "documentId", "reviewRequestId", "permissions", "password", "expiresAt"],
};

test("openapi drift: the SDK covers exactly the public endpoint set", () => {
  const actual = new Set<string>();
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops)) actual.add(`${method} ${path}`);
  }
  const expected = new Set(EXPECTED_ENDPOINTS);

  const missing = [...expected].filter((e) => !actual.has(e));
  const unexpected = [...actual].filter((a) => !expected.has(a));

  assert.deepEqual(missing, [], `SDK expects endpoints the spec no longer has: ${missing.join(", ")}`);
  assert.deepEqual(
    unexpected,
    [],
    `Spec has endpoints the SDK does not cover (add them or update EXPECTED_ENDPOINTS): ${unexpected.join(", ")}`,
  );
});

test("openapi drift: request-body DTO properties match the SDK types", () => {
  for (const [schemaName, expectedProps] of Object.entries(EXPECTED_SCHEMA_PROPS)) {
    const schema = spec.components.schemas[schemaName];
    assert.ok(schema, `Spec is missing schema '${schemaName}' — did a DTO get renamed?`);
    const actual = Object.keys(schema.properties ?? {}).sort();
    assert.deepEqual(
      actual,
      [...expectedProps].sort(),
      `Property drift in '${schemaName}': update src/types.ts and EXPECTED_SCHEMA_PROPS to match the spec.`,
    );
  }
});

test("openapi drift: the create endpoint still requires the x-api-key security scheme", () => {
  const post = spec.paths["/v1/documents"]?.["post"] as { security?: unknown[] } | undefined;
  assert.ok(post, "POST /v1/documents is missing from the spec");
  assert.ok(
    Array.isArray(post.security) && post.security.length > 0,
    "POST /v1/documents lost its security requirement (the SDK sends x-api-key on it).",
  );
});

function loadSpec(): OpenApiSpec {
  const path = join(__dirname, "__fixtures__", "openapi.snapshot.json");
  return JSON.parse(readFileSync(path, "utf8")) as OpenApiSpec;
}
