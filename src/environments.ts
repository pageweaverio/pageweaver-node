import type { HttpClient } from "./http";
import type {
  CreateEnvironmentParams,
  Environment,
  EnvironmentPin,
  PromotePinsParams,
  PromotePinsResult,
  UpdateEnvironmentParams,
} from "./types";

/**
 * Environments & pins (Pillar 2). A named per-account pointer set over immutable template versions, so
 * `documents.create({ environment: "production" })` renders the pinned version instead of a numeric one.
 * Writes require an API key with the `deploy` scope (never a naked template write); reads need `read`.
 * Pins point at published versions by number; history comes from what wrote the pin, never from mutating
 * a version row.
 */
export class EnvironmentsResource {
  constructor(private readonly http: HttpClient) {}

  /** Every environment for the account, with pin counts. */
  list(signal?: AbortSignal): Promise<Environment[]> {
    return this.http.json<Environment[]>("GET", "/v1/environments", { signal });
  }

  /** Create a named pointer set (e.g. staging / production). Returns `201`. */
  create(params: CreateEnvironmentParams, signal?: AbortSignal): Promise<Environment> {
    return this.http.json<Environment>("POST", "/v1/environments", { body: params, signal });
  }

  /** Fetch one environment by slug. */
  get(slug: string, signal?: AbortSignal): Promise<Environment> {
    return this.http.json<Environment>("GET", `/v1/environments/${encodeURIComponent(slug)}`, { signal });
  }

  /** Rename an environment or flip its production flag. The slug is immutable. */
  update(slug: string, params: UpdateEnvironmentParams, signal?: AbortSignal): Promise<Environment> {
    return this.http.json<Environment>("PATCH", `/v1/environments/${encodeURIComponent(slug)}`, {
      body: params,
      signal,
    });
  }

  /** Delete an environment and its pins (audited). */
  delete(slug: string, signal?: AbortSignal): Promise<{ deleted: true }> {
    return this.http.json<{ deleted: true }>(
      "DELETE",
      `/v1/environments/${encodeURIComponent(slug)}`,
      { signal },
    );
  }

  /** The template → version pointers in an environment. */
  pins(slug: string, signal?: AbortSignal): Promise<EnvironmentPin[]> {
    return this.http.json<EnvironmentPin[]>(
      "GET",
      `/v1/environments/${encodeURIComponent(slug)}/pins`,
      { signal },
    );
  }

  /** Point a template at one of its published versions (creates or moves the pin). */
  setPin(
    slug: string,
    templateId: string,
    version: number,
    signal?: AbortSignal,
  ): Promise<EnvironmentPin> {
    return this.http.json<EnvironmentPin>(
      "PUT",
      `/v1/environments/${encodeURIComponent(slug)}/pins/${encodeURIComponent(templateId)}`,
      { body: { version }, signal },
    );
  }

  /** Unpin a template from an environment. */
  removePin(slug: string, templateId: string, signal?: AbortSignal): Promise<{ deleted: true }> {
    return this.http.json<{ deleted: true }>(
      "DELETE",
      `/v1/environments/${encodeURIComponent(slug)}/pins/${encodeURIComponent(templateId)}`,
      { signal },
    );
  }

  /**
   * Copy another environment's pin set onto this one (e.g. staging → production). Pass `templates` to
   * partial-promote. Version history is never touched — only pointers move.
   */
  promote(slug: string, params: PromotePinsParams, signal?: AbortSignal): Promise<PromotePinsResult> {
    return this.http.json<PromotePinsResult>(
      "POST",
      `/v1/environments/${encodeURIComponent(slug)}/promote`,
      { body: params, signal },
    );
  }
}
