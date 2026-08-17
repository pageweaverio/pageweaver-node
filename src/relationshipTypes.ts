import type { HttpClient } from "./http";
import { requireId, requireObjectBody, requireString } from "./validation";
import type {
  CreateRelationshipTypeParams,
  CursorPage,
  DeprecateRelationshipTypeParams,
  RelationshipTypeStatus,
  RelationshipTypeView,
  UpdateRelationshipTypeParams,
} from "./types";

/**
 * Edge-rule definitions between object types (key, label/inverseLabel, allowed source/target types,
 * cardinality). Deliberately not versioned — nothing is ever validated against a frozen snapshot of
 * one. Reads need `objects:read`; writes need `relationships:manage`.
 */
export class RelationshipTypesResource {
  constructor(private readonly http: HttpClient) {}

  list(
    params: { status?: RelationshipTypeStatus; cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<CursorPage<RelationshipTypeView>> {
    return this.http.json<CursorPage<RelationshipTypeView>>("GET", "/v1/relationship-types", {
      query: { status: params.status, cursor: params.cursor, limit: params.limit },
      signal,
    });
  }

  get(id: string, signal?: AbortSignal): Promise<RelationshipTypeView> {
    requireId(id, "id");
    return this.http.json<RelationshipTypeView>(
      "GET",
      `/v1/relationship-types/${encodeURIComponent(id)}`,
      { signal },
    );
  }

  /** `inverseLabel` is required: relationships read in both directions (source→target, target→source). */
  create(params: CreateRelationshipTypeParams, signal?: AbortSignal): Promise<RelationshipTypeView> {
    requireObjectBody(params, "params");
    requireString(params.key, "params.key");
    requireString(params.label, "params.label");
    requireString(params.inverseLabel, "params.inverseLabel");
    return this.http.json<RelationshipTypeView>("POST", "/v1/relationship-types", {
      body: params,
      signal,
    });
  }

  /** Changes govern only edges created AFTER the update; existing edges are never re-checked or removed. */
  update(
    id: string,
    params: UpdateRelationshipTypeParams,
    signal?: AbortSignal,
  ): Promise<RelationshipTypeView> {
    requireId(id, "id");
    requireObjectBody(params, "params");
    return this.http.json<RelationshipTypeView>(
      "PATCH",
      `/v1/relationship-types/${encodeURIComponent(id)}`,
      { body: params, signal },
    );
  }

  /** Deprecate a relationship type. No delete — existing edges of this type are untouched. */
  deprecate(
    id: string,
    params: DeprecateRelationshipTypeParams,
    signal?: AbortSignal,
  ): Promise<RelationshipTypeView> {
    requireId(id, "id");
    requireString(params?.reason, "params.reason");
    return this.http.json<RelationshipTypeView>(
      "POST",
      `/v1/relationship-types/${encodeURIComponent(id)}/deprecate`,
      { body: params, signal },
    );
  }
}
