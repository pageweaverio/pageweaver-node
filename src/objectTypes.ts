import type { HttpClient } from "./http";
import { requireId, requireObjectBody, requirePositiveInt, requireString } from "./validation";
import type {
  CreateObjectTypeParams,
  CursorPage,
  DeprecateObjectTypeParams,
  ListObjectTypesParams,
  ObjectTypeDetailView,
  ObjectTypeDraftParams,
  ObjectTypeVersionDetail,
  ObjectTypeVersionSummary,
  ObjectTypeView,
  PublishedObjectTypeView,
  PublishObjectTypeParams,
} from "./types";

/**
 * Typed business-record definitions: draft + immutable-published-version model, mirroring template
 * versioning. Reads need the `objects:read` scope; writes need `object-types:manage`. See
 * {@link ObjectsResource} for the records themselves.
 */
export class ObjectTypesResource {
  constructor(private readonly http: HttpClient) {}

  /** List object types owned by the key's account. */
  list(params: ListObjectTypesParams = {}, signal?: AbortSignal): Promise<CursorPage<ObjectTypeView>> {
    return this.http.json<CursorPage<ObjectTypeView>>("GET", "/v1/object-types", {
      query: { status: params.status, cursor: params.cursor, limit: params.limit },
      signal,
    });
  }

  /** Fetch one object type's current view plus its draft (unpublished working) artifact. */
  get(id: string, signal?: AbortSignal): Promise<ObjectTypeDetailView> {
    requireId(id, "id");
    return this.http.json<ObjectTypeDetailView>(
      "GET",
      `/v1/object-types/${encodeURIComponent(id)}`,
      { signal },
    );
  }

  /** Create an object type draft. `key` is immutable once set; publish it with {@link publish}. */
  create(params: CreateObjectTypeParams, signal?: AbortSignal): Promise<ObjectTypeView> {
    requireObjectBody(params, "params");
    requireString(params.key, "params.key");
    requireString(params.nameSingular, "params.nameSingular");
    requireString(params.namePlural, "params.namePlural");
    return this.http.json<ObjectTypeView>("POST", "/v1/object-types", { body: params, signal });
  }

  /** Edit the draft. Any field omitted is left unchanged; editing clears `hasUnpublishedChanges`'s prior hash. */
  update(
    id: string,
    params: ObjectTypeDraftParams,
    signal?: AbortSignal,
  ): Promise<ObjectTypeView> {
    requireId(id, "id");
    requireObjectBody(params, "params");
    return this.http.json<ObjectTypeView>(
      "PATCH",
      `/v1/object-types/${encodeURIComponent(id)}`,
      { body: params, signal },
    );
  }

  /** List published (immutable) versions, newest first. */
  versions(
    id: string,
    params: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<CursorPage<ObjectTypeVersionSummary>> {
    requireId(id, "id");
    return this.http.json<CursorPage<ObjectTypeVersionSummary>>(
      "GET",
      `/v1/object-types/${encodeURIComponent(id)}/versions`,
      { query: { cursor: params.cursor, limit: params.limit }, signal },
    );
  }

  /** Fetch one immutable published version, including its compiled field policies. */
  version(id: string, version: number, signal?: AbortSignal): Promise<ObjectTypeVersionDetail> {
    requireId(id, "id");
    requirePositiveInt(version, "version");
    return this.http.json<ObjectTypeVersionDetail>(
      "GET",
      `/v1/object-types/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
      { signal },
    );
  }

  /**
   * Publish the draft, freezing its schema + policies into a new immutable version. Republishing an
   * unchanged draft is a no-op: it returns the CURRENT version with `unchanged: true` (no new version
   * minted).
   */
  publish(
    id: string,
    params: PublishObjectTypeParams = {},
    signal?: AbortSignal,
  ): Promise<PublishedObjectTypeView> {
    requireId(id, "id");
    return this.http.json<PublishedObjectTypeView>(
      "POST",
      `/v1/object-types/${encodeURIComponent(id)}/publish`,
      { body: params, signal },
    );
  }

  /** Deprecate a type (idempotent no-op if already deprecated). Existing records are unaffected. */
  deprecate(
    id: string,
    params: DeprecateObjectTypeParams,
    signal?: AbortSignal,
  ): Promise<ObjectTypeView> {
    requireId(id, "id");
    requireString(params?.reason, "params.reason");
    return this.http.json<ObjectTypeView>(
      "POST",
      `/v1/object-types/${encodeURIComponent(id)}/deprecate`,
      { body: params, signal },
    );
  }
}
