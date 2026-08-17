import { HttpClient, type FetchLike, type RetryOptions } from "./http";
import { DocumentsResource } from "./documents";
import { TemplatesResource } from "./templates";
import { SchemasResource } from "./schemas";
import { UsageResource } from "./usage";
import { CommentsResource } from "./comments";
import { ReviewsResource } from "./reviews";
import { ShareLinksResource } from "./shareLinks";
import { EnvironmentsResource } from "./environments";
import { DeploymentsResource } from "./deployments";
import { FormsResource } from "./forms";
import { SubmissionsResource } from "./submissions";
import { ObjectTypesResource } from "./objectTypes";
import { ObjectsResource } from "./objects";
import { RelationshipTypesResource } from "./relationshipTypes";
import { SearchResource } from "./search";
import { WorkflowDefinitionsResource } from "./workflowDefinitions";
import { FormTemplatesResource } from "./formTemplates";
import { IntakeResource } from "./intake";
import { ErrorCodesResource } from "./errorCodes";
import { EventsResource } from "./events";

export interface PageWeaverOptions {
  /** Your secret API key: `pk_live_...` in production, `pk_test_...` in development. */
  apiKey: string;
  /**
   * API base URL. Defaults to `https://api.pageweaver.io`. Point it at `http://localhost:4000`
   * when developing against a local stack.
   */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Provide a custom `fetch` (defaults to the global one; requires Node 18+ otherwise). */
  fetch?: FetchLike;
  /**
   * Automatic retry policy for transient failures (429, 5xx, network errors) on requests safe to
   * repeat. Set `{ maxRetries: 0 }` to disable. See {@link RetryOptions}.
   */
  retry?: RetryOptions;
}

/**
 * The PageWeaver API client.
 *
 * ```ts
 * const pw = new PageWeaver({ apiKey: process.env.PAGEWEAVER_API_KEY! });
 * const doc = await pw.documents.createAndWait({ templateId: "tmpl_invoice", payload: { total: 42 } });
 * const pdf = await pw.documents.download(doc.id);
 * ```
 */
export class PageWeaver {
  readonly documents: DocumentsResource;
  readonly templates: TemplatesResource;
  readonly schemas: SchemasResource;
  readonly usage: UsageResource;
  /** Anchored comment threads on documents (requires a `review`-scoped key for writes). */
  readonly comments: CommentsResource;
  /** Review requests + approvals on documents (requires a `review`-scoped key for writes). */
  readonly reviews: ReviewsResource;
  /** Capability-scoped external share links (requires a `review`-scoped key). */
  readonly shareLinks: ShareLinksResource;
  /** Named per-account environments + pins over template versions (requires a `deploy`-scoped key for writes). */
  readonly environments: EnvironmentsResource;
  /** Plan documents-as-code deployments from a manifest (requires a `deploy`-scoped key for writes). */
  readonly deployments: DeploymentsResource;
  /** Smart Forms (Phase D): discover forms, dry-run a payload, submit headlessly (`render` scope to submit). */
  readonly forms: FormsResource;
  /** Form submissions: poll a submission's status + the document it produced. */
  readonly submissions: SubmissionsResource;
  /** Typed business-record type definitions (`objects:read` to read, `object-types:manage` to write). */
  readonly objectTypes: ObjectTypesResource;
  /** Typed business records (`objects:read`/`objects:write`; `relationships:manage` for edges + document links). */
  readonly objects: ObjectsResource;
  /** Relationship-type definitions between object types (`objects:read` to read, `relationships:manage` to write). */
  readonly relationshipTypes: RelationshipTypesResource;
  /** Full-text search across objects and documents (`search:read`, plus `objects:read` for object hits). */
  readonly search: SearchResource;
  /** Read-only workflow definitions (`workflows:read`). */
  readonly workflowDefinitions: WorkflowDefinitionsResource;
  /** Fillable AcroForm PDF templates: upload, then fill (`documents:upload` to upload, `render` to fill). */
  readonly formTemplates: FormTemplatesResource;
  /** First-class document ingestion — upload a PDF you already have (`documents:upload`). */
  readonly intake: IntakeResource;
  /** The public error-code catalog (`GET /v1/errors`); no API key required. */
  readonly errorCodes: ErrorCodesResource;
  /** The append-only domain-event ledger (baseline `read` scope). */
  readonly events: EventsResource;

  constructor(options: PageWeaverOptions) {
    const http = new HttpClient(options);
    this.documents = new DocumentsResource(http);
    this.templates = new TemplatesResource(http);
    this.schemas = new SchemasResource(http);
    this.usage = new UsageResource(http);
    this.comments = new CommentsResource(http);
    this.reviews = new ReviewsResource(http);
    this.shareLinks = new ShareLinksResource(http);
    this.environments = new EnvironmentsResource(http);
    this.deployments = new DeploymentsResource(http);
    this.forms = new FormsResource(http);
    this.submissions = new SubmissionsResource(http);
    this.objectTypes = new ObjectTypesResource(http);
    this.objects = new ObjectsResource(http);
    this.relationshipTypes = new RelationshipTypesResource(http);
    this.search = new SearchResource(http);
    this.workflowDefinitions = new WorkflowDefinitionsResource(http);
    this.formTemplates = new FormTemplatesResource(http);
    this.intake = new IntakeResource(http);
    this.errorCodes = new ErrorCodesResource(http);
    this.events = new EventsResource(http);
  }
}
