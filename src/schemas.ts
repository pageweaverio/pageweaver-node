import type { HttpClient } from "./http";
import type {
  Schema,
  SchemaSummary,
  SchemaVersionDetail,
  SchemaVersionSummary,
} from "./types";

/** Read-only discovery of the JSON Schemas your payloads validate against. */
export class SchemasResource {
  constructor(private readonly http: HttpClient) {}

  /** All schemas owned by the key's account, newest-updated first. */
  list(signal?: AbortSignal): Promise<SchemaSummary[]> {
    return this.http.json<SchemaSummary[]>("GET", "/v1/schemas", { signal });
  }

  /**
   * A schema's published JSON Schema plus a derived sample, for the latest published version or a
   * specific `version`.
   */
  get(id: string, opts: { version?: number; signal?: AbortSignal } = {}): Promise<Schema> {
    return this.http.json<Schema>("GET", `/v1/schemas/${encodeURIComponent(id)}`, {
      query: { version: opts.version },
      signal: opts.signal,
    });
  }

  /** A schema's published version history (newest first). Pin any via `schemaVersion` on create. */
  versions(id: string, signal?: AbortSignal): Promise<SchemaVersionSummary[]> {
    return this.http.json<SchemaVersionSummary[]>(
      "GET",
      `/v1/schemas/${encodeURIComponent(id)}/versions`,
      { signal },
    );
  }

  /**
   * One published version's metadata, plus its frozen FieldNode tree when `include: "nodes"` — the typed
   * structure `pageweaver pull` writes to `schemas/<name>.nodes.json`.
   */
  version(
    id: string,
    version: number,
    opts: { include?: "nodes"; signal?: AbortSignal } = {},
  ): Promise<SchemaVersionDetail> {
    return this.http.json<SchemaVersionDetail>(
      "GET",
      `/v1/schemas/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
      { query: { include: opts.include }, signal: opts.signal },
    );
  }
}
