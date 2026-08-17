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
//
// KNOWN GAP (2026-08-17): the committed snapshot predates several already-shipped routes/fields that
// the SDK now covers (object model, search, form-templates, document trust/diff, workflow-definitions,
// the error registry, the intake sessions batch endpoint, and `classification` on CreateUploadSessionDto).
// They are intentionally left OUT of EXPECTED_ENDPOINTS / EXPECTED_SCHEMA_PROPS below rather than
// hand-authored into the fixture, so this guard only asserts what a real `sync:openapi` run has verified.
// Run `pnpm --filter @pageweaver/sdk sync:openapi` against a live API before the next release to fold
// them in and extend the guard to match.

interface OpenApiSpec {
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, { properties?: Record<string, unknown> }>;
  };
}

const spec = loadSpec();

/** Every endpoint the SDK calls, as `METHOD path`. Kept exhaustive so a NEW public path fails the test. */
const EXPECTED_ENDPOINTS: string[] = [
  "post /v1/documents",
  "post /v1/documents/validate",
  "get /v1/documents",
  "get /v1/documents/{id}",
  "get /v1/documents/{id}/verify",
  "get /v1/documents/{id}/accessibility",
  "get /v1/documents/{id}/receipt",
  "get /v1/documents/{id}/proof",
  "post /v1/documents/{id}/regenerate",
  "get /v1/documents/{id}/content",
  "get /v1/templates",
  "get /v1/templates/{id}",
  "get /v1/templates/{id}/versions",
  "get /v1/templates/{id}/versions/{version}",
  "get /v1/templates/{id}/versions/{version}/attest",
  // Document lineage: supersedes the retired /v1/living-documents/* surface (ODP-016/D187-189).
  // The public /d/:alias resolver is ApiExcludeController (not in the spec).
  "post /v1/documents/{id}/versions",
  "get /v1/documents/{id}/versions",
  "get /v1/documents/{id}/versions/{seq}",
  "get /v1/documents/{id}/representations",
  "get /v1/schemas",
  "get /v1/schemas/{id}",
  "get /v1/schemas/{id}/versions",
  "get /v1/schemas/{id}/versions/{version}",
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
  // Template proposals (Pillar 2, V2-B06).
  "post /v1/templates/{id}/proposals",
  "get /v1/templates/{id}/proposals",
  "get /v1/templates/{id}/proposals/{proposalId}",
  "post /v1/templates/{id}/proposals/{proposalId}/checks",
  "post /v1/templates/{id}/proposals/{proposalId}/approve",
  "post /v1/templates/{id}/proposals/{proposalId}/reject",
  "post /v1/templates/{id}/proposals/{proposalId}/promote",
  "delete /v1/templates/{id}/proposals/{proposalId}",
  // Environments & pins (Pillar 2, V2-B06).
  "get /v1/environments",
  "post /v1/environments",
  "get /v1/environments/{slug}",
  "patch /v1/environments/{slug}",
  "delete /v1/environments/{slug}",
  "get /v1/environments/{slug}/pins",
  "put /v1/environments/{slug}/pins/{templateId}",
  "delete /v1/environments/{slug}/pins/{templateId}",
  "post /v1/environments/{slug}/promote",
  "post /v1/environments/{slug}/rollback",
  // Deployments — documents-as-code (Pillar 3, V2-C02 plan; V2-C03 apply).
  "post /v1/deployments/plan",
  "post /v1/deployments/{id}/apply",
  "get /v1/deployments",
  "get /v1/deployments/{id}",
  // Smart Forms (Phase D, V2-D06). Form authoring has no public write path (portal + manifest only).
  "get /v1/forms",
  "get /v1/forms/{id}",
  "get /v1/forms/{id}/versions",
  "post /v1/forms/{id}/validate",
  "post /v1/forms/{id}/submissions",
  "get /v1/submissions/{id}",
  // Object types (typed business-record definitions).
  "get /v1/object-types",
  "post /v1/object-types",
  "get /v1/object-types/{id}",
  "patch /v1/object-types/{id}",
  "get /v1/object-types/{id}/versions",
  "get /v1/object-types/{id}/versions/{version}",
  "post /v1/object-types/{id}/publish",
  "post /v1/object-types/{id}/deprecate",
  // Objects (typed business records).
  "get /v1/objects",
  "post /v1/objects",
  "get /v1/objects/{id}",
  "put /v1/objects/{id}",
  "get /v1/objects/{id}/versions",
  "post /v1/objects/{id}/archive",
  "post /v1/objects/{id}/restore",
  "get /v1/objects/{id}/relationships",
  "post /v1/objects/{id}/relationships",
  "post /v1/objects/{id}/relationships/{relationshipId}/end",
  "get /v1/objects/{id}/documents",
  "post /v1/objects/{id}/documents",
  "delete /v1/objects/{id}/documents/{documentId}",
  // Relationship types.
  "get /v1/relationship-types",
  "post /v1/relationship-types",
  "get /v1/relationship-types/{id}",
  "patch /v1/relationship-types/{id}",
  "post /v1/relationship-types/{id}/deprecate",
  // Search.
  "get /v1/search",
  // Domain events.
  "get /v1/events",
  // Document intake / upload.
  "post /v1/documents/intake",
  "post /v1/documents/intake/sessions",
  "get /v1/documents/intake/sessions/{id}",
  "delete /v1/documents/intake/sessions/{id}",
  "put /v1/documents/intake/sessions/{id}/chunks/{index}",
  "post /v1/documents/intake/sessions/{id}/finalize",
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
    "environment",
    "idempotencyKey",
    "callbackUrl",
    "publicAlias",
    "name",
    "options",
  ],
  // Append a new version to a document's lineage — supersedes the retired living-documents reissue.
  AppendDocumentVersionDto: ["payload"],
  ValidateDocumentDto: [
    "templateId",
    "payload",
    "version",
    "environment",
    "schemaId",
    "schemaVersion",
  ],
  // Regenerate replay mode (E13) — mirrored by documents.regenerate({ mode }).
  RegenerateDocumentDto: ["mode"],
  OutputDto: [
    "format",
    // Structured e-invoice data for a `facturx` render (a canonical EN 16931 invoice object).
    // Modeled on DocumentOutput.invoice as the hand-written EInvoice type.
    "invoice",
    "width",
    "height",
    "clip",
    "quality",
    "transparent",
    "optimizeForSpeed",
    // Archival PDF/A conformance. Modeled on DocumentOutput.pdfa as `"2b" | "3b" | "none"` —
    // deliberately NOT "1b", which the API refuses because the conversion cannot produce a valid one.
    "pdfa",
    // Accessible PDF/UA-1 conformance. Modeled on DocumentOutput.pdfUa as `"1" | "none"` — one level,
    // because PDF/UA-2 needs PDF 2.0, which the renderer does not emit.
    "pdfUa",
    // How a non-conformant accessible document is handled. DocumentOutput.conformance.
    "conformance",
    // NOTE: the spec's OutputDto also carries a `profile` field not yet modeled on DocumentOutput —
    // pre-existing drift (present before this SDK update), tracked separately from the changes here.
    "profile",
  ],
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
  OptionsWatermarkDto: [
    "text",
    "pages",
    "fontSizePt",
    "color",
    "opacity",
    "rotation",
  ],
  OptionsStructureDto: ["outline", "taggedPdf"],
  RenderLocalizationDto: ["locale", "timeZone", "currency", "direction"],
  OptionsSecurityDto: ["pdf", "signature", "download"],
  OptionsPdfSecurityDto: ["userPassword", "ownerPassword", "permissions"],
  OptionsPdfPermissionsDto: [
    "printing",
    "copying",
    "modifying",
    "annotating",
    "fillingForms",
    "assembling",
  ],
  OptionsSignatureDto: [
    "enabled",
    "reason",
    "location",
    "contactInfo",
    "certSource",
    "timestamp",
  ],
  OptionsDownloadSecurityDto: ["enabled", "password", "generate"],
  OptionsDeliveryDto: ["mode", "destinationIds", "email"],
  OptionsDeliveryEmailDto: ["to", "cc", "bcc", "subject", "body", "mode", "attachmentName"],
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
  UpdateCommentDto: [
    "severity",
    "assignedToUserId",
    "dueAt",
    "pageNumber",
    "x",
    "y",
    "width",
    "height",
  ],
  ReplyDto: ["body", "mentions", "parentMessageId"],
  MigrateCommentsDto: ["fromDocumentId"],
  ReviewPolicyDto: [
    "requireAllCommentsResolved",
    "blockerCommentsPreventApproval",
    "requiredApproverCount",
    "allowApprovalWithOpenComments",
  ],
  ParticipantInputDto: ["userId", "externalEmail", "externalName", "role"],
  CreateReviewDto: [
    "documentId",
    "title",
    "message",
    "dueAt",
    "policy",
    "participants",
  ],
  AddParticipantDto: ["userId", "externalEmail", "externalName", "role"],
  ApprovalDto: ["decision", "note", "approverUserId"],
  ShareLinkPermissionsDto: [
    "canView",
    "canComment",
    "canDownload",
    "canApprove",
    "requireEmail",
    "allowedDomains",
  ],
  CreateShareLinkDto: [
    "targetType",
    "documentId",
    "reviewRequestId",
    "permissions",
    "password",
    "expiresAt",
  ],
  // Template proposals + environments request DTOs (Pillar 2, V2-B06).
  OpenProposalDto: [
    "fromDraft",
    "html",
    "css",
    "payload",
    "payloadSchema",
    "editorMode",
    "editorSource",
    "renderSettings",
    "note",
  ],
  ProposalDecisionDto: ["note", "approverUserId"],
  RunProposalChecksDto: [
    "regressionMode",
    "checks",
    "minSuccessfulFixtures",
    "failOnErrors",
  ],
  CreateEnvironmentDto: ["name", "slug", "isProduction"],
  UpdateEnvironmentDto: ["name", "isProduction"],
  SetPinDto: ["version"],
  PromotePinsDto: ["from", "templates"],
  RollbackDto: ["toDeploymentId"],
  // Deployments request DTO (Pillar 3, V2-C02). Apply takes no body (path param only).
  PlanDeploymentDto: [
    "environment",
    "manifest",
    "files",
    "commitSha",
    "sourceRef",
    "source",
    "gitRepo",
    "env",
  ],
  // Smart Forms request DTOs (Phase D, V2-D06). Both carry just the field `data`.
  ValidateFormDto: ["data"],
  CreateSubmissionDto: ["data"],
  // Object types (typed business-record definitions).
  CreateObjectTypeDto: [
    "key",
    "nameSingular",
    "namePlural",
    "description",
    "schema",
    "uiSchema",
    "policyOverlay",
    "lifecycle",
    "search",
    "accessPolicy",
  ],
  UpdateObjectTypeDto: [
    "nameSingular",
    "namePlural",
    "description",
    "schema",
    "uiSchema",
    "policyOverlay",
    "lifecycle",
    "search",
    "accessPolicy",
  ],
  PublishObjectTypeDto: ["note"],
  DeprecateObjectTypeDto: ["reason"],
  // Objects (typed business records).
  CreateObjectDto: [
    "objectTypeKey",
    "objectTypeId",
    "data",
    "number",
    "lifecycleState",
    "ownerUserId",
    "classification",
    "changeReason",
    "source",
    "idempotencyKey",
  ],
  UpdateObjectDto: [
    "data",
    "expectedVersion",
    "lifecycleState",
    "ownerUserId",
    "classification",
    "changeReason",
    "source",
  ],
  ArchiveObjectDto: ["reason"],
  CreateRelationshipDto: ["relationshipTypeKey", "relationshipTypeId", "targetObjectId", "metadata"],
  EndRelationshipDto: ["reason"],
  LinkDocumentDto: ["documentId", "role"],
  // Relationship types.
  CreateRelationshipTypeDto: [
    "key",
    "label",
    "inverseLabel",
    "description",
    "sourceTypeKeys",
    "targetTypeKeys",
    "cardinality",
    "metadataSchema",
  ],
  UpdateRelationshipTypeDto: [
    "label",
    "inverseLabel",
    "description",
    "sourceTypeKeys",
    "targetTypeKeys",
    "cardinality",
    "metadataSchema",
  ],
  DeprecateRelationshipTypeDto: ["reason"],
  // Document intake / upload. NOTE: the live DTO has also grown a `classification` field (D223) not
  // yet in this fixture — see the KNOWN GAP note above. Re-sync before extending this entry.
  CreateUploadSessionDto: ["filename", "mediaType", "totalBytes", "chunkSize", "objectId", "objectRole"],
};

test("openapi drift: the SDK covers exactly the public endpoint set", () => {
  const actual = new Set<string>();
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops)) actual.add(`${method} ${path}`);
  }
  const expected = new Set(EXPECTED_ENDPOINTS);

  const missing = [...expected].filter((e) => !actual.has(e));
  const unexpected = [...actual].filter((a) => !expected.has(a));

  assert.deepEqual(
    missing,
    [],
    `SDK expects endpoints the spec no longer has: ${missing.join(", ")}`,
  );
  assert.deepEqual(
    unexpected,
    [],
    `Spec has endpoints the SDK does not cover (add them or update EXPECTED_ENDPOINTS): ${unexpected.join(", ")}`,
  );
});

test("openapi drift: request-body DTO properties match the SDK types", () => {
  for (const [schemaName, expectedProps] of Object.entries(
    EXPECTED_SCHEMA_PROPS,
  )) {
    const schema = spec.components.schemas[schemaName];
    assert.ok(
      schema,
      `Spec is missing schema '${schemaName}' — did a DTO get renamed?`,
    );
    const actual = Object.keys(schema.properties ?? {}).sort();
    assert.deepEqual(
      actual,
      [...expectedProps].sort(),
      `Property drift in '${schemaName}': update src/types.ts and EXPECTED_SCHEMA_PROPS to match the spec.`,
    );
  }
});

test("openapi drift: the create endpoint still requires the x-api-key security scheme", () => {
  const post = spec.paths["/v1/documents"]?.["post"] as
    | { security?: unknown[] }
    | undefined;
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
