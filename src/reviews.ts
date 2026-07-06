import type { HttpClient } from "./http";
import type {
  AddParticipantParams,
  ApprovalParams,
  CreateReviewParams,
  ListReviewsParams,
  ReviewPage,
  ReviewRequest,
} from "./types";

/**
 * Review requests on documents: create, list, add participants, and collect approvals against a
 * completion policy. Requires an API key with the `review` scope for writes.
 */
export class ReviewsResource {
  constructor(private readonly http: HttpClient) {}

  /** Open a review on a document with an optional policy + participants. Returns `201`. */
  create(params: CreateReviewParams, signal?: AbortSignal): Promise<ReviewRequest> {
    return this.http.json<ReviewRequest>("POST", "/v1/reviews", { body: params, signal });
  }

  /** List reviews, newest first. Filter by `status`/`documentId`; page with `cursor`. */
  list(params: ListReviewsParams = {}, signal?: AbortSignal): Promise<ReviewPage> {
    return this.http.json<ReviewPage>("GET", "/v1/reviews", {
      query: {
        status: params.status,
        documentId: params.documentId,
        cursor: params.cursor,
        limit: params.limit,
      },
      signal,
    });
  }

  /** Fetch one review with its participants, append-only approvals, and computed policy state. */
  get(id: string, signal?: AbortSignal): Promise<ReviewRequest> {
    return this.http.json<ReviewRequest>("GET", `/v1/reviews/${encodeURIComponent(id)}`, { signal });
  }

  /** Add a participant (member `userId`, or `externalEmail` + `externalName`) with a role. */
  addParticipant(id: string, params: AddParticipantParams, signal?: AbortSignal): Promise<ReviewRequest> {
    return this.http.json<ReviewRequest>(
      "POST",
      `/v1/reviews/${encodeURIComponent(id)}/participants`,
      { body: params, signal },
    );
  }

  /**
   * Record an approval decision. Returns `201`; the review auto-completes when its policy is
   * satisfied. A `409` means the policy forbids it right now (e.g. open blocking comments).
   */
  approve(id: string, params: ApprovalParams, signal?: AbortSignal): Promise<ReviewRequest> {
    return this.http.json<ReviewRequest>("POST", `/v1/reviews/${encodeURIComponent(id)}/approvals`, {
      body: params,
      signal,
    });
  }

  /** Manually complete a review (policy-satisfied, or forced by an admin). */
  complete(id: string, signal?: AbortSignal): Promise<ReviewRequest> {
    return this.http.json<ReviewRequest>("POST", `/v1/reviews/${encodeURIComponent(id)}/complete`, {
      signal,
    });
  }

  /** Withdraw a review (open → cancelled). */
  cancel(id: string, signal?: AbortSignal): Promise<ReviewRequest> {
    return this.http.json<ReviewRequest>("POST", `/v1/reviews/${encodeURIComponent(id)}/cancel`, {
      signal,
    });
  }
}
