import type { HttpClient } from "./http";
import type { Project } from "./types";

/** Discover account-local document initiatives and confirm the selected API project context. */
export class ProjectsResource {
  constructor(private readonly http: HttpClient) {}

  list(signal?: AbortSignal): Promise<Project[]> {
    return this.http.json<Project[]>("GET", "/v1/projects", { signal });
  }
}
