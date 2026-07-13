import type { HttpClient } from "./http";
import type {
  ListProposalsParams,
  OpenProposalParams,
  ProposalDecisionParams,
  ProposalPage,
  PromoteProposalResult,
  RunProposalChecksParams,
  TemplateProposal,
} from "./types";

/**
 * Template proposals — the PR analog for template changes (Pillar 2). A proposal freezes a candidate
 * change; it is reviewed and approved, then promoted into a published `TemplateVersion`. Rejecting or
 * retracting one never touches the live version or any pinned integration. All writes require an API key
 * with the `deploy` scope (a proposal write is never a naked template write); reads need `read`.
 *
 * Reached as `client.templates.proposals`, scoped to a template id passed on each call.
 */
export class ProposalsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Open a proposal on a template: freeze a candidate (inline `html`/`css`/`payloadSchema`, or
   * `fromDraft: true` to use the saved draft). No new version is created. Returns `202` with the
   * proposal; render-diff checks run asynchronously (poll {@link get} for `checkStatus`).
   */
  open(
    templateId: string,
    params: OpenProposalParams = {},
    signal?: AbortSignal,
  ): Promise<TemplateProposal> {
    return this.http.json<TemplateProposal>(
      "POST",
      `/v1/templates/${encodeURIComponent(templateId)}/proposals`,
      { body: params, signal },
    );
  }

  /** List a template's proposals, newest first. Filter by `status`; page with `cursor`. */
  list(
    templateId: string,
    params: ListProposalsParams = {},
    signal?: AbortSignal,
  ): Promise<ProposalPage> {
    return this.http.json<ProposalPage>(
      "GET",
      `/v1/templates/${encodeURIComponent(templateId)}/proposals`,
      {
        query: { status: params.status, cursor: params.cursor, limit: params.limit },
        signal,
      },
    );
  }

  /** Fetch one proposal with its check summary, append-only approvals, and promote-gate state. */
  get(templateId: string, proposalId: string, signal?: AbortSignal): Promise<TemplateProposal> {
    return this.http.json<TemplateProposal>(
      "GET",
      `/v1/templates/${encodeURIComponent(templateId)}/proposals/${encodeURIComponent(proposalId)}`,
      { signal },
    );
  }

  /** Re-run the render-diff regression (candidate vs. the live version, per dataset). Returns `202`. */
  rerunChecks(
    templateId: string,
    proposalId: string,
    paramsOrSignal: RunProposalChecksParams | AbortSignal = {},
    signal?: AbortSignal,
  ): Promise<TemplateProposal> {
    const params = isAbortSignal(paramsOrSignal) ? {} : paramsOrSignal;
    const requestSignal = isAbortSignal(paramsOrSignal) ? paramsOrSignal : signal;
    return this.http.json<TemplateProposal>(
      "POST",
      `/v1/templates/${encodeURIComponent(templateId)}/proposals/${encodeURIComponent(proposalId)}/checks`,
      { body: params, signal: requestSignal },
    );
  }

  /**
   * Append an approval decision. Attribute it to a named approver via `approverUserId`, or omit it for an
   * integration approval authorized by the key's `deploy` scope. The author can never approve. Returns `201`.
   */
  approve(
    templateId: string,
    proposalId: string,
    params: ProposalDecisionParams = {},
    signal?: AbortSignal,
  ): Promise<TemplateProposal> {
    return this.http.json<TemplateProposal>(
      "POST",
      `/v1/templates/${encodeURIComponent(templateId)}/proposals/${encodeURIComponent(proposalId)}/approve`,
      { body: params, signal },
    );
  }

  /** Append a rejection decision and move the proposal to the `rejected` terminal state. Returns `201`. */
  reject(
    templateId: string,
    proposalId: string,
    params: ProposalDecisionParams = {},
    signal?: AbortSignal,
  ): Promise<TemplateProposal> {
    return this.http.json<TemplateProposal>(
      "POST",
      `/v1/templates/${encodeURIComponent(templateId)}/proposals/${encodeURIComponent(proposalId)}/reject`,
      { body: params, signal },
    );
  }

  /**
   * Promote the candidate: publish it as the next version through the serialized, gate-checked publish.
   * Fails (`409`) when the approval gate is unmet, blocking comments are open, or the base version moved.
   */
  promote(templateId: string, proposalId: string, signal?: AbortSignal): Promise<PromoteProposalResult> {
    return this.http.json<PromoteProposalResult>(
      "POST",
      `/v1/templates/${encodeURIComponent(templateId)}/proposals/${encodeURIComponent(proposalId)}/promote`,
      { signal },
    );
  }

  /** Withdraw an open proposal (only while open). The live version is untouched. */
  retract(templateId: string, proposalId: string, signal?: AbortSignal): Promise<{ ok: true }> {
    return this.http.json<{ ok: true }>(
      "DELETE",
      `/v1/templates/${encodeURIComponent(templateId)}/proposals/${encodeURIComponent(proposalId)}`,
      { signal },
    );
  }
}

function isAbortSignal(value: RunProposalChecksParams | AbortSignal): value is AbortSignal {
  return typeof AbortSignal !== "undefined" && value instanceof AbortSignal;
}
