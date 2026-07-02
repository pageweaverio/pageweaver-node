import { HttpClient, type FetchLike } from "./http";
import { DocumentsResource } from "./documents";
import { TemplatesResource } from "./templates";
import { SchemasResource } from "./schemas";
import { UsageResource } from "./usage";

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

  constructor(options: PageWeaverOptions) {
    const http = new HttpClient(options);
    this.documents = new DocumentsResource(http);
    this.templates = new TemplatesResource(http);
    this.schemas = new SchemasResource(http);
    this.usage = new UsageResource(http);
  }
}
