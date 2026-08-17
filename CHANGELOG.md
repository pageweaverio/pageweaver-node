# Changelog

All notable changes to `@pageweaver/sdk` are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.2.1 - 2026-08-18

### Changed

- Renamed `PageWeaverApiError` to `PageWeaverAPIError` (all-caps `API`) for casing consistency with
  the other PageWeaver SDKs. Every subclass (`PageWeaverAuthenticationError`, `PageWeaverPermissionError`,
  `PageWeaverNotFoundError`, `PageWeaverConflictError`, `PageWeaverValidationError`,
  `PageWeaverPlanRequiredError`, `PageWeaverRateLimitError`, `PageWeaverServerError`) is unaffected.
  Update any `instanceof PageWeaverApiError` checks.

## 0.2.0 - 2026-08-17

### Added

- Full parity with the live `/v1` API: `objectTypes`, `objects`, `relationshipTypes`, `search`,
  `workflowDefinitions`, `formTemplates`, `intake` (+ resumable/chunked/batch upload sessions),
  `errorCodes`, `events`.
- `documents.trust`, `documents.diff`, `documents.appendVersion`, `documents.versions`,
  `documents.version`, `documents.representations`, and `name`/`publicAlias` on `documents.create`.
- Typed error hierarchy off `PageWeaverApiError`: `PageWeaverValidationError`,
  `PageWeaverAuthenticationError`, `PageWeaverPlanRequiredError`, `PageWeaverPermissionError`
  (`isScopeMissing`/`requiredScope`), `PageWeaverNotFoundError`, `PageWeaverConflictError`,
  `PageWeaverRateLimitError`, `PageWeaverServerError`, plus `PageWeaverInvalidRequestError` for
  client-side checks.
- Automatic retry with exponential backoff + jitter on `429`/`5xx`, honoring `Retry-After`, restricted
  to safe methods (`GET`/`HEAD`/`PUT`/`DELETE` always, `POST` only with an idempotency key).
- Client-side validation for blank ids, missing required fields, malformed bodies, and
  mutually-exclusive-field pairs.
- Multipart upload support in the HTTP layer for the new file endpoints.
- `localization.direction` (`"auto"`/`"ltr"`/`"rtl"`) on `LocalizationOptions`.
- `parentMessageId` on `ReplyParams` and `CommentMessage`.
- `gitRepo` on `PlanDeploymentParams`.

### Removed

- **BREAKING:** `PageWeaver({ project })` and `client.projects` — the API no longer has a Project
  tier; an account is the only tenant level.
- `livingDocuments` — folded into the document-lineage endpoints (`documents.versions`/
  `documents.appendVersion`). See the README migration section.

## 0.1.0 - initial release

- Initial `@pageweaver/sdk` release: documents, templates, schemas, environments, deployments,
  reviews, proposals, comments, share links, usage, webhooks.
