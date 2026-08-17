import type { HttpClient } from "./http";
import type { DomainEventPage, ListEventsParams } from "./types";

/**
 * The append-only domain-event ledger: what happened, in order, for correlation and replay. Entries
 * are filtered to what the calling key's scopes can see (a key without `objects:read` sees nothing
 * about object-model events); hidden entries are silently dropped, not an error. Requires only the
 * baseline `read` scope every key has.
 */
export class EventsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Page through events. `after` is the resume point (exclusive) — always resume from the returned
   * `nextCursor`, even if it doesn't equal the last event you saw (some may have been scope-trimmed).
   */
  list(params: ListEventsParams = {}, signal?: AbortSignal): Promise<DomainEventPage> {
    return this.http.json<DomainEventPage>("GET", "/v1/events", {
      query: {
        after: params.after,
        limit: params.limit,
        type: params.type,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        correlationId: params.correlationId,
      },
      signal,
    });
  }

  /**
   * Iterate every visible event forward from `after` (or the beginning), transparently following
   * `nextCursor`. Stops once a page comes back with no events (you have caught up); call again later
   * with the last `after` you saw to resume.
   *
   * ```ts
   * let after: string | undefined;
   * for await (const event of pw.events.listAll({ type: "document.completed" })) {
   *   after = event.seq;
   *   // ...
   * }
   * ```
   */
  async *listAll(
    params: Omit<ListEventsParams, "after"> & { after?: string } = {},
    signal?: AbortSignal,
  ): AsyncGenerator<DomainEventPage["events"][number]> {
    let after = params.after;
    for (;;) {
      const page = await this.list({ ...params, after }, signal);
      if (page.events.length === 0) return;
      for (const event of page.events) yield event;
      after = page.nextCursor ?? undefined;
      if (!after) return;
    }
  }
}
