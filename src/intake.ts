import type { HttpClient } from "./http";
import { requireId, requireNonEmptyArray, requireNonNegativeInt, requireObjectBody } from "./validation";
import type {
  BulkUploadFileParams,
  CreateUploadSessionBatchParams,
  CreateUploadSessionBatchResult,
  CreateUploadSessionParams,
  IntakeDocumentParams,
  IntakeFinalizeResult,
  IntakeResultView,
  UploadableFile,
  UploadSessionView,
} from "./types";

/**
 * First-class document ingestion: bring in a PDF you already have (not a template render). Small
 * files use {@link create} directly; larger ones use a resumable chunked {@link sessions} upload.
 * Every route requires the `documents:upload` scope.
 */
export class IntakeResource {
  readonly sessions: IntakeSessionsResource;

  constructor(private readonly http: HttpClient) {
    this.sessions = new IntakeSessionsResource(http);
  }

  /** Synchronously ingest one PDF (multipart). Returns `202`. */
  create(params: IntakeDocumentParams, signal?: AbortSignal): Promise<IntakeResultView> {
    requireObjectBody(params, "params");
    return this.http.jsonMultipart<IntakeResultView>(
      "POST",
      "/v1/documents/intake",
      {
        fields: {
          objectId: params.objectId,
          objectRole: params.objectRole,
          classification: params.classification,
        },
        files: { file: toFilePart(params.file) },
      },
      { signal },
    );
  }
}

/** Resumable chunked uploads: start a session, `PUT` each chunk, then finalize. Sessions expire 24h after creation. */
export class IntakeSessionsResource {
  constructor(private readonly http: HttpClient) {}

  /** Start a resumable upload session. `chunkSize` is capped at 10 MiB by the API. Returns `201`. */
  create(params: CreateUploadSessionParams, signal?: AbortSignal): Promise<UploadSessionView> {
    requireObjectBody(params, "params");
    return this.http.json<UploadSessionView>("POST", "/v1/documents/intake/sessions", {
      body: params,
      signal,
    });
  }

  /** Start up to 200 resumable sessions at once (bulk import). Partial failure is expected: each file's outcome is reported individually. */
  createBatch(
    params: CreateUploadSessionBatchParams,
    signal?: AbortSignal,
  ): Promise<CreateUploadSessionBatchResult> {
    requireObjectBody(params, "params");
    requireNonEmptyArray<BulkUploadFileParams>(params.files, "params.files");
    return this.http.json<CreateUploadSessionBatchResult>(
      "POST",
      "/v1/documents/intake/sessions/batch",
      { body: params, signal },
    );
  }

  get(id: string, signal?: AbortSignal): Promise<UploadSessionView> {
    requireId(id, "id");
    return this.http.json<UploadSessionView>(
      "GET",
      `/v1/documents/intake/sessions/${encodeURIComponent(id)}`,
      { signal },
    );
  }

  /** Abandon a session and delete its staged chunks. A `done` session cannot be abandoned. */
  abandon(id: string, signal?: AbortSignal): Promise<UploadSessionView> {
    requireId(id, "id");
    return this.http.json<UploadSessionView>(
      "DELETE",
      `/v1/documents/intake/sessions/${encodeURIComponent(id)}`,
      { signal },
    );
  }

  /** Upload one 0-based chunk (multipart, `chunk` field). Idempotent: re-sending an already-received index is a no-op success. */
  uploadChunk(
    id: string,
    index: number,
    chunk: Uint8Array | ArrayBuffer | Blob,
    signal?: AbortSignal,
  ): Promise<UploadSessionView> {
    requireId(id, "id");
    requireNonNegativeInt(index, "index");
    return this.http.jsonMultipart<UploadSessionView>(
      "PUT",
      `/v1/documents/intake/sessions/${encodeURIComponent(id)}/chunks/${encodeURIComponent(index)}`,
      { files: { chunk: { data: chunk, filename: "chunk" } } },
      { signal },
    );
  }

  /**
   * Finalize a session once every chunk has arrived. A single-file/PDF session resolves to an
   * {@link IntakeResultView}; a ZIP session expands into many documents and resolves to an
   * `IntakeArchiveResultView`. Returns `202`.
   */
  finalize(id: string, signal?: AbortSignal): Promise<IntakeFinalizeResult> {
    requireId(id, "id");
    return this.http.json<IntakeFinalizeResult>(
      "POST",
      `/v1/documents/intake/sessions/${encodeURIComponent(id)}/finalize`,
      { signal },
    );
  }
}

function toFilePart(
  file: UploadableFile,
): { data: Uint8Array | ArrayBuffer | Blob; filename: string; contentType?: string } {
  const BlobCtor = (globalThis as { Blob?: typeof Blob }).Blob;
  if (BlobCtor && file instanceof BlobCtor) {
    const named = file as Blob & { name?: string };
    return { data: file, filename: named.name ?? "document.pdf", contentType: file.type || undefined };
  }
  const f = file as { data: Uint8Array | ArrayBuffer; filename: string; contentType?: string };
  return { data: f.data, filename: f.filename || "document.pdf", contentType: f.contentType };
}
