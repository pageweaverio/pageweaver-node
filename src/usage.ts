import type { HttpClient } from "./http";
import type { Usage } from "./types";

/** Your page consumption against the plan quota for the current billing period. */
export class UsageResource {
  constructor(private readonly http: HttpClient) {}

  /** Current-period usage: billable document pages and editor preview pages, with their limits. */
  get(signal?: AbortSignal): Promise<Usage> {
    return this.http.json<Usage>("GET", "/v1/usage", { signal });
  }
}
