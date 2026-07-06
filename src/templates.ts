import type { HttpClient } from "./http";
import { ProposalsResource } from "./proposals";
import type {
  Template,
  TemplateSummary,
  TemplateVersionDetail,
  TemplateVersionSummary,
} from "./types";

/** Read-only discovery of your published templates and their pinnable versions. */
export class TemplatesResource {
  /** Template change proposals — the PR analog for template changes (requires a `deploy`-scoped key). */
  readonly proposals: ProposalsResource;

  constructor(private readonly http: HttpClient) {
    this.proposals = new ProposalsResource(http);
  }

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

  /**
   * One published version's metadata, plus its frozen editor source when `include: "source"` — the
   * compiled HTML/CSS, render settings, test data, and pinned schema that `pageweaver pull` exports.
   */
  version(
    id: string,
    version: number,
    opts: { include?: "source"; signal?: AbortSignal } = {},
  ): Promise<TemplateVersionDetail> {
    return this.http.json<TemplateVersionDetail>(
      "GET",
      `/v1/templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
      { query: { include: opts.include }, signal: opts.signal },
    );
  }
}
