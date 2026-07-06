import { HttpClient, type FetchLike } from "./http";
import { DocumentsResource } from "./documents";
import { TemplatesResource } from "./templates";
import { SchemasResource } from "./schemas";
import { UsageResource } from "./usage";
import { CommentsResource } from "./comments";
import { ReviewsResource } from "./reviews";
import { ShareLinksResource } from "./shareLinks";
import { EnvironmentsResource } from "./environments";

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
  }
}
