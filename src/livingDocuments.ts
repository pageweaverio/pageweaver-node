import type { HttpClient } from "./http";
import type {
  CreateLivingDocumentParams,
  CreateLivingDocumentResult,
  LivingDocumentDetail,
  LivingDocumentPage,
  LivingDocumentVersionInfo,
  ListLivingDocumentsParams,
  ReissueLivingDocumentParams,
  ReissueLivingDocumentResult,
} from "./types";

/**
 * Living documents (F04): a stable identity whose permanent `/d/:alias` link always resolves to the
 * latest issued version, while every prior version stays a pinnable, tamper-verifiable snapshot.
 * Reissuing validates the new payload against the pinned schema and appends a superseding version.
 */
export class LivingDocumentsResource {
  constructor(private readonly http: HttpClient) {}

  /** Create a living document and issue its first version. Returns the identity + the queued document. */
  create(
    params: CreateLivingDocumentParams,
    signal?: AbortSignal,
  ): Promise<CreateLivingDocumentResult> {
    return this.http.json<CreateLivingDocumentResult>("POST", "/v1/living-documents", {
      body: params,
      signal,
    });
  }

  /** Reissue: append a new version under the same identity (supersedes the prior head). */
  reissue(
    id: string,
    params: ReissueLivingDocumentParams,
    signal?: AbortSignal,
  ): Promise<ReissueLivingDocumentResult> {
    return this.http.json<ReissueLivingDocumentResult>(
      "POST",
      `/v1/living-documents/${encodeURIComponent(id)}/versions`,
      { body: params, signal },
    );
  }

  /** One page of the account's living documents, newest first. Use `nextCursor` to page. */
  list(params: ListLivingDocumentsParams = {}, signal?: AbortSignal): Promise<LivingDocumentPage> {
    return this.http.json<LivingDocumentPage>("GET", "/v1/living-documents", {
      query: { cursor: params.cursor, limit: params.limit },
      signal,
    });
  }

  /** One living document with its full version history + per-version integrity. */
  get(id: string, signal?: AbortSignal): Promise<LivingDocumentDetail> {
    return this.http.json<LivingDocumentDetail>(
      "GET",
      `/v1/living-documents/${encodeURIComponent(id)}`,
      { signal },
    );
  }

  /** One pinned version's metadata + integrity. */
  version(id: string, seq: number, signal?: AbortSignal): Promise<LivingDocumentVersionInfo> {
    return this.http.json<LivingDocumentVersionInfo>(
      "GET",
      `/v1/living-documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(seq)}`,
      { signal },
    );
  }
}
