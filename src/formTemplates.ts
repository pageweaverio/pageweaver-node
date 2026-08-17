import type { HttpClient } from "./http";
import { requireId, requireObjectBody, requireString } from "./validation";
import type {
  CreateFormTemplateParams,
  FillFormTemplateParams,
  FillResultView,
  FormTemplateDetail,
  FormTemplateSummary,
  FormTemplateUploadResult,
  FormTemplateVersionSummary,
  UploadableFile,
} from "./types";

/**
 * Fillable AcroForm templates: upload a PDF that already has its own form fields, then fill and render
 * it as a document. Distinct from {@link FormsResource} (Smart Forms), which is a Liquid template +
 * JSON Schema. Uploads need the `documents:upload` scope, reads need `read`, filling needs `render`.
 */
export class FormTemplatesResource {
  constructor(private readonly http: HttpClient) {}

  /** Upload a PDF as a new fillable template. Scans, safety-checks, and enumerates its AcroForm fields. */
  create(
    params: CreateFormTemplateParams,
    signal?: AbortSignal,
  ): Promise<FormTemplateUploadResult> {
    requireObjectBody(params, "params");
    requireString(params.name, "params.name");
    return this.http.jsonMultipart<FormTemplateUploadResult>(
      "POST",
      "/v1/form-templates",
      {
        fields: { name: params.name, description: params.description },
        files: { file: toFilePart(params.file, "template.pdf") },
      },
      { signal },
    );
  }

  list(signal?: AbortSignal): Promise<FormTemplateSummary[]> {
    return this.http.json<FormTemplateSummary[]>("GET", "/v1/form-templates", { signal });
  }

  /** Fetch a template plus its current version's derived field-schema contract. */
  get(id: string, signal?: AbortSignal): Promise<FormTemplateDetail> {
    requireId(id, "id");
    return this.http.json<FormTemplateDetail>(
      "GET",
      `/v1/form-templates/${encodeURIComponent(id)}`,
      { signal },
    );
  }

  versions(id: string, signal?: AbortSignal): Promise<FormTemplateVersionSummary[]> {
    requireId(id, "id");
    return this.http.json<FormTemplateVersionSummary[]>(
      "GET",
      `/v1/form-templates/${encodeURIComponent(id)}/versions`,
      { signal },
    );
  }

  /** Upload a new version of an existing template. Re-runs the full pipeline (scan, safety checks, field re-enumeration). */
  addVersion(
    id: string,
    file: UploadableFile,
    signal?: AbortSignal,
  ): Promise<FormTemplateUploadResult> {
    requireId(id, "id");
    return this.http.jsonMultipart<FormTemplateUploadResult>(
      "POST",
      `/v1/form-templates/${encodeURIComponent(id)}/versions`,
      { files: { file: toFilePart(file, "template.pdf") } },
      { signal },
    );
  }

  /**
   * Fill and render the template with `payload` (keyed by the AcroForm's dotted field name). Stored as
   * an ordinary document — hash chain, retention, and delivery are all inherited. Returns `202`.
   */
  fill(
    id: string,
    params: FillFormTemplateParams,
    signal?: AbortSignal,
  ): Promise<FillResultView> {
    requireId(id, "id");
    requireObjectBody(params, "params");
    requireObjectBody(params.payload, "params.payload");
    return this.http.json<FillResultView>(
      "POST",
      `/v1/form-templates/${encodeURIComponent(id)}/fill`,
      { body: params, signal },
    );
  }
}

function toFilePart(
  file: UploadableFile,
  fallbackFilename: string,
): { data: Uint8Array | ArrayBuffer | Blob; filename: string; contentType?: string } {
  const BlobCtor = (globalThis as { Blob?: typeof Blob }).Blob;
  if (BlobCtor && file instanceof BlobCtor) {
    const named = file as Blob & { name?: string };
    return { data: file, filename: named.name ?? fallbackFilename, contentType: file.type || undefined };
  }
  const f = file as { data: Uint8Array | ArrayBuffer; filename: string; contentType?: string };
  return { data: f.data, filename: f.filename || fallbackFilename, contentType: f.contentType };
}
