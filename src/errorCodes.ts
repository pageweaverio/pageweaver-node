import type { HttpClient } from "./http";
import type { ErrorCatalogResponse } from "./types";

/**
 * The public, unauthenticated catalog of every coded API failure (`GET /v1/errors`): the HTTP status
 * each code always answers with, plus a cause/resolution pair. Build typed handling around
 * {@link import("./errors").PageWeaverApiError.code} against this instead of hardcoding strings, since
 * status codes are shared across many failure kinds but `code` is unique per cause. Requires no API
 * key (like `/openapi.json`).
 */
export class ErrorCodesResource {
  constructor(private readonly http: HttpClient) {}

  list(signal?: AbortSignal): Promise<ErrorCatalogResponse> {
    return this.http.json<ErrorCatalogResponse>("GET", "/v1/errors", { noAuth: true, signal });
  }
}
