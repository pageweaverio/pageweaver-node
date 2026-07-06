import type { HttpClient } from "./http";
import type {
  Deployment,
  DeploymentDetail,
  ListDeploymentsParams,
  PlanDeploymentParams,
} from "./types";

/**
 * Deployments — documents-as-code (Pillar 3). Plan a `pageweaver.yml` manifest against a target
 * environment: the server re-validates it, diffs it against live state, and returns a reviewable
 * Terraform-style change list. Plan and apply are separate, explicit calls — planning never changes
 * anything. All writes require an API key with the `deploy` scope; reads need `read`.
 */
export class DeploymentsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Plan a deployment: send the manifest text + the contents of every file it names + the target
   * environment. Returns `202` with the plan (`plan.changes` carries before/after hashes; an unchanged
   * manifest is all no-op). Re-planning the same manifest at the same `commitSha` (or with the same
   * `Idempotency-Key`) returns the existing plan. Nothing is applied.
   */
  plan(
    params: PlanDeploymentParams,
    opts: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<Deployment> {
    return this.http.json<Deployment>("POST", "/v1/deployments/plan", {
      body: params,
      headers: opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
      signal: opts.signal,
    });
  }

  /** Recent deployments for the account, newest first. Filter by `environment` slug. */
  list(params: ListDeploymentsParams = {}, signal?: AbortSignal): Promise<Deployment[]> {
    return this.http.json<Deployment[]>("GET", "/v1/deployments", {
      query: { environment: params.environment, limit: params.limit },
      signal,
    });
  }

  /** One deployment with its per-resource plan lines and their apply outcomes. */
  get(id: string, signal?: AbortSignal): Promise<DeploymentDetail> {
    return this.http.json<DeploymentDetail>("GET", `/v1/deployments/${encodeURIComponent(id)}`, {
      signal,
    });
  }

  /**
   * Apply a planned deployment: publish the changed schema/template versions and write the environment's
   * pins. Returns `202` with the deployment in `applying` — poll `get(id)` for the terminal
   * `succeeded`/`failed`. Re-applying an in-flight or completed deployment returns it unchanged; a
   * production deployment publishing a gate-on template without an approved proposal returns `409`.
   */
  apply(id: string, signal?: AbortSignal): Promise<DeploymentDetail> {
    return this.http.json<DeploymentDetail>(
      "POST",
      `/v1/deployments/${encodeURIComponent(id)}/apply`,
      { signal },
    );
  }
}
