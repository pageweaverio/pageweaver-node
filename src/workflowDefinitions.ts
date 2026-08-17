import type { HttpClient } from "./http";
import { requireId, requirePositiveInt } from "./validation";
import type {
  CursorPage,
  ListWorkflowDefinitionsParams,
  WorkflowDefinitionDetailView,
  WorkflowDefinitionVersionDetail,
  WorkflowDefinitionVersionSummary,
  WorkflowDefinitionView,
} from "./types";

/**
 * Read-only discovery of workflow definitions (the stage graph / transitions / task templates a
 * workflow compiles to). No public write route yet — authoring is via `deploy` / documents-as-code or
 * the portal designer. Requires the `workflows:read` scope.
 */
export class WorkflowDefinitionsResource {
  constructor(private readonly http: HttpClient) {}

  list(
    params: ListWorkflowDefinitionsParams = {},
    signal?: AbortSignal,
  ): Promise<CursorPage<WorkflowDefinitionView>> {
    return this.http.json<CursorPage<WorkflowDefinitionView>>("GET", "/v1/workflow-definitions", {
      query: { status: params.status, cursor: params.cursor, limit: params.limit },
      signal,
    });
  }

  get(id: string, signal?: AbortSignal): Promise<WorkflowDefinitionDetailView> {
    requireId(id, "id");
    return this.http.json<WorkflowDefinitionDetailView>(
      "GET",
      `/v1/workflow-definitions/${encodeURIComponent(id)}`,
      { signal },
    );
  }

  versions(
    id: string,
    params: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<CursorPage<WorkflowDefinitionVersionSummary>> {
    requireId(id, "id");
    return this.http.json<CursorPage<WorkflowDefinitionVersionSummary>>(
      "GET",
      `/v1/workflow-definitions/${encodeURIComponent(id)}/versions`,
      { query: { cursor: params.cursor, limit: params.limit }, signal },
    );
  }

  version(
    id: string,
    version: number,
    signal?: AbortSignal,
  ): Promise<WorkflowDefinitionVersionDetail> {
    requireId(id, "id");
    requirePositiveInt(version, "version");
    return this.http.json<WorkflowDefinitionVersionDetail>(
      "GET",
      `/v1/workflow-definitions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
      { signal },
    );
  }
}
