import type { HttpClient } from "./http";
import type {
  CreateSubmissionResult,
  Form,
  FormDataParams,
  FormDetail,
  FormVersion,
  ValidateFormResult,
} from "./types";

/**
 * Smart Forms: discover your published forms + their field contract, dry-run a payload against a form's
 * rules, and submit headlessly. Forms are *authored* in the portal (or deployed via a manifest) — the API
 * is read + submit only. `validate` needs any valid key; `submit` requires the `render` scope (it produces
 * a document) and counts against your monthly submission limit.
 */
export class FormsResource {
  constructor(private readonly http: HttpClient) {}

  /** List your published forms (id, name, slug, current version, pinned template + schema). */
  list(signal?: AbortSignal): Promise<Form[]> {
    return this.http.json<Form[]>("GET", "/v1/forms", { signal });
  }

  /** Fetch one form with its machine-readable field contract (pinned schema JSON + layout summary). */
  get(id: string, signal?: AbortSignal): Promise<FormDetail> {
    return this.http.json<FormDetail>("GET", `/v1/forms/${encodeURIComponent(id)}`, { signal });
  }

  /** Published version history of a form (newest first). */
  versions(id: string, signal?: AbortSignal): Promise<FormVersion[]> {
    return this.http.json<FormVersion[]>("GET", `/v1/forms/${encodeURIComponent(id)}/versions`, { signal });
  }

  /**
   * Dry-run a payload against a form's rules + contract WITHOUT metering, persisting, or rendering.
   * Returns validity, the validation messages, and the evaluated rule state (visible/required/computed).
   * A great CI check before wiring up a real submission.
   */
  validate(id: string, params: FormDataParams, signal?: AbortSignal): Promise<ValidateFormResult> {
    return this.http.json<ValidateFormResult>("POST", `/v1/forms/${encodeURIComponent(id)}/validate`, {
      body: params,
      signal,
    });
  }

  /**
   * Submit a form's field values headlessly (requires the `render` scope). The server evaluates the rules
   * authoritatively (hidden fields are discarded, spoofed `_form` is ignored), validates, and — when valid
   * — renders the bound template. Returns `202` with the submission id + status; poll
   * {@link SubmissionsResource.get} for the linked document.
   */
  submit(id: string, params: FormDataParams, signal?: AbortSignal): Promise<CreateSubmissionResult> {
    return this.http.json<CreateSubmissionResult>("POST", `/v1/forms/${encodeURIComponent(id)}/submissions`, {
      body: params,
      signal,
    });
  }
}
