import type { HttpClient } from "./http";
import type {
  CreatedShareLink,
  CreateShareLinkParams,
  ListShareLinksParams,
  ShareLink,
  ShareLinkList,
} from "./types";

/**
 * Capability-scoped links that let people without an account view, comment on, or approve a document
 * (the `/r/<token>` external surface). Requires an API key with the `review` scope.
 */
export class ShareLinksResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a share link. The response includes the raw `url` and `token` exactly once — only the
   * hash is stored server-side, so capture it now.
   */
  create(params: CreateShareLinkParams, signal?: AbortSignal): Promise<CreatedShareLink> {
    return this.http.json<CreatedShareLink>("POST", "/v1/share-links", { body: params, signal });
  }

  /** List active + disabled links (never the tokens). Filter by document or review. */
  list(params: ListShareLinksParams = {}, signal?: AbortSignal): Promise<ShareLinkList> {
    return this.http.json<ShareLinkList>("GET", "/v1/share-links", {
      query: { documentId: params.documentId, reviewRequestId: params.reviewRequestId },
      signal,
    });
  }

  /** Disable a link immediately (the kill switch). */
  disable(id: string, signal?: AbortSignal): Promise<ShareLink> {
    return this.http.json<ShareLink>("POST", `/v1/share-links/${encodeURIComponent(id)}/disable`, {
      signal,
    });
  }
}
