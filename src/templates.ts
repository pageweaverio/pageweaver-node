import type { HttpClient } from "./http";
import type { Template, TemplateSummary, TemplateVersionSummary } from "./types";

/** Read-only discovery of your published templates and their pinnable versions. */
export class TemplatesResource {
  constructor(private readonly http: HttpClient) {}

  /** All templates owned by the key's account, newest-updated first. */
  list(signal?: AbortSignal): Promise<TemplateSummary[]> {
    return this.http.json<TemplateSummary[]>("GET", "/v1/templates", { signal });
  }

  /** One template's metadata (name, current version, associated schema, authoring mode). */
  get(id: string, signal?: AbortSignal): Promise<Template> {
    return this.http.json<Template>("GET", `/v1/templates/${encodeURIComponent(id)}`, { signal });
  }

  /** A template's published version history (newest first). Pin any via `version` on create. */
  versions(id: string, signal?: AbortSignal): Promise<TemplateVersionSummary[]> {
    return this.http.json<TemplateVersionSummary[]>(
      "GET",
      `/v1/templates/${encodeURIComponent(id)}/versions`,
      { signal },
    );
  }
}
