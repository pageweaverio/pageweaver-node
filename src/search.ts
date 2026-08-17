import type { HttpClient } from "./http";
import { requireString } from "./validation";
import type { SearchAccountPage, SearchParams } from "./types";

/**
 * Full-text search across objects and documents, permission-trimmed: a hit the caller may not view is
 * silently dropped, never surfaced as a 403 (avoids confirming a hidden record exists). Requires the
 * `search:read` scope; object hits are additionally gated by `objects:read`.
 */
export class SearchResource {
  constructor(private readonly http: HttpClient) {}

  /** `params.q` is required and uses websearch syntax: quote a phrase, `-exclude`, `OR`. */
  query(params: SearchParams, signal?: AbortSignal): Promise<SearchAccountPage> {
    requireString(params?.q, "params.q");
    return this.http.json<SearchAccountPage>("GET", "/v1/search", {
      query: {
        q: params.q,
        subjectType: params.subjectType,
        objectTypeKey: params.objectTypeKey,
        classification: params.classification,
        ownerUserId: params.ownerUserId,
        updatedAfter: params.updatedAfter,
        updatedBefore: params.updatedBefore,
        cursor: params.cursor,
        limit: params.limit,
      },
      signal,
    });
  }
}
