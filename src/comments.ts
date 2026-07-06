import type { HttpClient } from "./http";
import type {
  CommentThread,
  CommentThreadPage,
  CreateCommentParams,
  ListCommentsParams,
  ReplyParams,
  UpdateCommentParams,
} from "./types";

/**
 * Anchored comment threads on rendered documents: create, list, reply, and lifecycle
 * (resolve / reopen / close). Requires an API key with the `review` scope for writes.
 */
export class CommentsResource {
  constructor(private readonly http: HttpClient) {}

  /** Create an anchored thread (point/area/text/page) with its first message. Returns `201`. */
  create(params: CreateCommentParams, signal?: AbortSignal): Promise<CommentThread> {
    return this.http.json<CommentThread>("POST", "/v1/comments", { body: params, signal });
  }

  /** List a document's threads, newest first. Filter by page/status/severity; page with `cursor`. */
  list(
    params: { documentId: string } & ListCommentsParams,
    signal?: AbortSignal,
  ): Promise<CommentThreadPage> {
    const { documentId, ...q } = params;
    return this.http.json<CommentThreadPage>(
      "GET",
      `/v1/documents/${encodeURIComponent(documentId)}/comments`,
      {
        query: {
          pageNumber: q.pageNumber,
          status: q.status,
          severity: q.severity,
          cursor: q.cursor,
          limit: q.limit,
        },
        signal,
      },
    );
  }

  /** Fetch one thread with its full message list. */
  get(id: string, signal?: AbortSignal): Promise<CommentThread> {
    return this.http.json<CommentThread>("GET", `/v1/comments/${encodeURIComponent(id)}`, { signal });
  }

  /** Edit severity, assignment, due date, or relocate the anchor coordinates. */
  update(id: string, params: UpdateCommentParams, signal?: AbortSignal): Promise<CommentThread> {
    return this.http.json<CommentThread>("PATCH", `/v1/comments/${encodeURIComponent(id)}`, {
      body: params,
      signal,
    });
  }

  /** Reply on a thread. Returns `201`. */
  reply(id: string, params: ReplyParams, signal?: AbortSignal): Promise<CommentThread> {
    return this.http.json<CommentThread>("POST", `/v1/comments/${encodeURIComponent(id)}/messages`, {
      body: params,
      signal,
    });
  }

  /** Resolve a thread (open → resolved). */
  resolve(id: string, signal?: AbortSignal): Promise<CommentThread> {
    return this.http.json<CommentThread>("POST", `/v1/comments/${encodeURIComponent(id)}/resolve`, {
      signal,
    });
  }

  /** Reopen a resolved thread (resolved → open). */
  reopen(id: string, signal?: AbortSignal): Promise<CommentThread> {
    return this.http.json<CommentThread>("POST", `/v1/comments/${encodeURIComponent(id)}/reopen`, {
      signal,
    });
  }

  /** Close a thread permanently (→ closed, final). */
  close(id: string, signal?: AbortSignal): Promise<CommentThread> {
    return this.http.json<CommentThread>("POST", `/v1/comments/${encodeURIComponent(id)}/close`, {
      signal,
    });
  }
}
