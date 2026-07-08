import type { HttpClient } from "./http";
import type { Submission } from "./types";

/**
 * Form submissions: read a submission's status + the document it produced. Submissions are *created* via
 * {@link FormsResource.submit} (`POST /v1/forms/:id/submissions`); this resource polls one by id.
 */
export class SubmissionsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch a submission's status, its data fingerprint, the linked document id (`renderJobId`) once it is
   * accepted for render, and the validation messages when it failed.
   */
  get(id: string, signal?: AbortSignal): Promise<Submission> {
    return this.http.json<Submission>("GET", `/v1/submissions/${encodeURIComponent(id)}`, { signal });
  }
}
