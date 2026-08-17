import type { HttpClient } from "./http";
import { requireId, requireObjectBody, requireOneOf, requirePositiveInt, requireString } from "./validation";
import type {
  ArchiveObjectParams,
  BusinessObjectValueView,
  BusinessObjectVersionSummary,
  BusinessObjectView,
  CreateObjectParams,
  CreateRelationshipParams,
  CursorPage,
  DocumentObjectLinkRole,
  DocumentObjectLinkView,
  EndRelationshipParams,
  LinkDocumentParams,
  ListObjectsParams,
  ObjectRelationshipEdge,
  RelationshipView,
  ReplaceObjectParams,
  UnlinkDocumentResult,
} from "./types";

/**
 * Typed business records: the values held under an {@link ObjectTypesResource} type. Reads need
 * `objects:read` (plus `objects:read-sensitive` to decrypt sensitive fields); writes need
 * `objects:write`; relationships and document links need `relationships:manage`.
 */
export class ObjectsResource {
  constructor(private readonly http: HttpClient) {}

  /** List objects. Rows never carry field data — {@link get} one for that. */
  list(params: ListObjectsParams = {}, signal?: AbortSignal): Promise<CursorPage<BusinessObjectView>> {
    return this.http.json<CursorPage<BusinessObjectView>>("GET", "/v1/objects", {
      query: {
        objectTypeKey: params.objectTypeKey,
        objectTypeId: params.objectTypeId,
        status: params.status,
        lifecycleState: params.lifecycleState,
        ownerUserId: params.ownerUserId,
        number: params.number,
        cursor: params.cursor,
        limit: params.limit,
      },
      signal,
    });
  }

  /**
   * Fetch one object's current (or a specific `version`'s) value. Pass `includeSensitive: true` to
   * decrypt sensitive fields (requires the `objects:read-sensitive` scope; a key without it gets a
   * 403, never a silently redacted response).
   */
  get(
    id: string,
    opts: { version?: number; includeSensitive?: boolean; signal?: AbortSignal } = {},
  ): Promise<BusinessObjectValueView> {
    requireId(id, "id");
    return this.http.json<BusinessObjectValueView>(
      "GET",
      `/v1/objects/${encodeURIComponent(id)}`,
      {
        query: {
          version: opts.version,
          includeSensitive: opts.includeSensitive ? "true" : undefined,
        },
        signal: opts.signal,
      },
    );
  }

  /**
   * Create an object. Provide exactly one of `objectTypeKey`/`objectTypeId`. Pass `idempotencyKey` to
   * make a retried create return the original record instead of creating a duplicate (sent as the
   * `Idempotency-Key` header); the same key with a different body is a 409.
   */
  create(params: CreateObjectParams, signal?: AbortSignal): Promise<BusinessObjectView> {
    requireObjectBody(params, "params");
    requireOneOf(params.objectTypeKey, "objectTypeKey", params.objectTypeId, "objectTypeId");
    requireObjectBody(params.data, "params.data");
    const { idempotencyKey, ...rest } = params;
    const headers = idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined;
    return this.http.json<BusinessObjectView>("POST", "/v1/objects", { body: rest, headers, signal });
  }

  /**
   * Replace an object's whole value (never merged). `expectedVersion` is required — an optimistic
   * concurrency check the API enforces with a 409 on mismatch, so a lost update never overwrites
   * someone else's change silently.
   */
  replace(id: string, params: ReplaceObjectParams, signal?: AbortSignal): Promise<BusinessObjectView> {
    requireId(id, "id");
    requireObjectBody(params, "params");
    requireObjectBody(params.data, "params.data");
    requirePositiveInt(params.expectedVersion, "params.expectedVersion");
    return this.http.json<BusinessObjectView>("PUT", `/v1/objects/${encodeURIComponent(id)}`, {
      body: params,
      headers: { "if-match": String(params.expectedVersion) },
      signal,
    });
  }

  /** Version history (metadata only, never values — read a version's value via {@link get} + `{ version }`). */
  versions(
    id: string,
    params: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<CursorPage<BusinessObjectVersionSummary>> {
    requireId(id, "id");
    return this.http.json<CursorPage<BusinessObjectVersionSummary>>(
      "GET",
      `/v1/objects/${encodeURIComponent(id)}/versions`,
      { query: { cursor: params.cursor, limit: params.limit }, signal },
    );
  }

  /** Archive an object (reversible via {@link restore}). */
  archive(id: string, params: ArchiveObjectParams, signal?: AbortSignal): Promise<BusinessObjectView> {
    requireId(id, "id");
    requireString(params?.reason, "params.reason");
    return this.http.json<BusinessObjectView>(
      "POST",
      `/v1/objects/${encodeURIComponent(id)}/archive`,
      { body: params, signal },
    );
  }

  /** Restore an archived object. No new version is created — status only. */
  restore(id: string, signal?: AbortSignal): Promise<BusinessObjectView> {
    requireId(id, "id");
    return this.http.json<BusinessObjectView>(
      "POST",
      `/v1/objects/${encodeURIComponent(id)}/restore`,
      { signal },
    );
  }

  /** List relationship edges to/from this object, in both directions. Pass `includeEnded` to include ended ones. */
  relationships(
    id: string,
    opts: { includeEnded?: boolean; signal?: AbortSignal } = {},
  ): Promise<ObjectRelationshipEdge[]> {
    requireId(id, "id");
    return this.http.json<ObjectRelationshipEdge[]>(
      "GET",
      `/v1/objects/${encodeURIComponent(id)}/relationships`,
      { query: { includeEnded: opts.includeEnded ? "true" : undefined }, signal: opts.signal },
    );
  }

  /**
   * Create a relationship from this object (the source) to `params.targetObjectId`. Provide exactly one
   * of `relationshipTypeKey`/`relationshipTypeId`. Refused (with a reason) when the endpoint types
   * aren't allowed, cardinality is already satisfied, either record is archived, or the target is in a
   * different account. `unchanged: true` on the result means an identical live edge already existed.
   */
  addRelationship(
    id: string,
    params: CreateRelationshipParams,
    signal?: AbortSignal,
  ): Promise<RelationshipView> {
    requireId(id, "id");
    requireObjectBody(params, "params");
    requireOneOf(
      params.relationshipTypeKey,
      "relationshipTypeKey",
      params.relationshipTypeId,
      "relationshipTypeId",
    );
    requireString(params.targetObjectId, "params.targetObjectId");
    return this.http.json<RelationshipView>(
      "POST",
      `/v1/objects/${encodeURIComponent(id)}/relationships`,
      { body: params, signal },
    );
  }

  /** End a relationship. The row stays (with `validTo` set); nothing is deleted. */
  endRelationship(
    id: string,
    relationshipId: string,
    params: EndRelationshipParams = {},
    signal?: AbortSignal,
  ): Promise<RelationshipView> {
    requireId(id, "id");
    requireId(relationshipId, "relationshipId");
    return this.http.json<RelationshipView>(
      "POST",
      `/v1/objects/${encodeURIComponent(id)}/relationships/${encodeURIComponent(relationshipId)}/end`,
      { body: params, signal },
    );
  }

  /** List documents filed against this object. */
  documents(id: string, signal?: AbortSignal): Promise<DocumentObjectLinkView[]> {
    requireId(id, "id");
    return this.http.json<DocumentObjectLinkView[]>(
      "GET",
      `/v1/objects/${encodeURIComponent(id)}/documents`,
      { signal },
    );
  }

  /** File a document against this object. Idempotent per `(document, object, role)`; default role `"primary"`. */
  linkDocument(
    id: string,
    params: LinkDocumentParams,
    signal?: AbortSignal,
  ): Promise<DocumentObjectLinkView> {
    requireId(id, "id");
    requireObjectBody(params, "params");
    requireString(params.documentId, "params.documentId");
    return this.http.json<DocumentObjectLinkView>(
      "POST",
      `/v1/objects/${encodeURIComponent(id)}/documents`,
      { body: params, signal },
    );
  }

  /** Unfile a document link. Idempotent: unlinking an absent link succeeds with `removed: false`. */
  unlinkDocument(
    id: string,
    documentId: string,
    opts: { role?: DocumentObjectLinkRole; signal?: AbortSignal } = {},
  ): Promise<UnlinkDocumentResult> {
    requireId(id, "id");
    requireId(documentId, "documentId");
    return this.http.json<UnlinkDocumentResult>(
      "DELETE",
      `/v1/objects/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`,
      { query: { role: opts.role }, signal: opts.signal },
    );
  }
}
