// @pageweaver/sdk — official TypeScript client for the PageWeaver PDF generation API.
// Server-side (Node 18+): uses the global `fetch` and `node:crypto` for webhook verification.

export { PageWeaver, type PageWeaverOptions } from "./client";
export type { FetchLike } from "./http";

export {
  DocumentsResource,
  type WaitOptions,
  type DownloadOptions,
  type CreateSyncOptions,
} from "./documents";
export { TemplatesResource } from "./templates";
export { SchemasResource } from "./schemas";
export { UsageResource } from "./usage";
export { CommentsResource } from "./comments";
export { ReviewsResource } from "./reviews";
export { ShareLinksResource } from "./shareLinks";

export {
  PageWeaverError,
  PageWeaverApiError,
  PageWeaverConnectionError,
  PageWeaverTimeoutError,
  PageWeaverDocumentFailedError,
} from "./errors";

export {
  verifyWebhook,
  verifyWebhookSignature,
  signWebhookBody,
  isDocumentEvent,
  isBatchEvent,
  PageWeaverWebhookSignatureError,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  type VerifyWebhookOptions,
  type WebhookPayload,
  type DocumentWebhookPayload,
  type BatchWebhookPayload,
  type WebhookEventName,
  type DocumentWebhookEventName,
  type BatchWebhookEventName,
} from "./webhooks";

export type {
  DocumentStatus,
  RenderOptions,
  PageOptions,
  RenderingOptions,
  MetadataOptions,
  BandOptions,
  WatermarkOptions,
  StructureOptions,
  LocalizationOptions,
  SecurityOptions,
  PdfSecurityOptions,
  PdfPermissions,
  DownloadSecurityOptions,
  CreateDocumentParams,
  CreateFromTemplateParams,
  CreateFromInlineParams,
  CreateDocumentResult,
  CreateSyncResult,
  DownloadInfo,
  Document,
  DocumentIntegrity,
  DocumentReviewSummary,
  DocumentVerification,
  DocumentListItem,
  ListDocumentsParams,
  DocumentPage,
  TemplateSummary,
  Template,
  TemplateVersionSummary,
  SchemaSummary,
  Schema,
  SchemaVersionSummary,
  Usage,
  // Review layer
  AnchorType,
  ThreadStatus,
  CommentSeverity,
  CommentVisibility,
  MigrationStatus,
  Mention,
  CreateCommentParams,
  UpdateCommentParams,
  ReplyParams,
  CommentMessage,
  CommentThread,
  CommentThreadPage,
  ListCommentsParams,
  ReviewStatus,
  ParticipantRole,
  ParticipantStatus,
  ApprovalDecision,
  ReviewPolicy,
  ParticipantInput,
  CreateReviewParams,
  AddParticipantParams,
  ApprovalParams,
  ReviewParticipant,
  Approval,
  ReviewPolicyState,
  ReviewRequest,
  ReviewPage,
  ListReviewsParams,
  ShareLinkTargetType,
  ShareLinkPermissions,
  CreateShareLinkParams,
  ShareLink,
  CreatedShareLink,
  ShareLinkList,
  ListShareLinksParams,
  DocumentPageInfo,
  MigrateCommentsParams,
  MigrateCommentsResult,
  CommentMigrationRollup,
} from "./types";
