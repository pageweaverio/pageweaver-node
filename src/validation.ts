import { PageWeaverInvalidRequestError } from "./errors";

// Lightweight client-side request validation: catch shape mistakes (a missing required field, a
// blank id interpolated into a URL, a body that isn't an object) before spending a network round
// trip. This deliberately does NOT re-implement the API's business rules or JSON Schema validation
// — the API remains the source of truth for those, and stays authoritative on anything not checked
// here. It only guards against the class of mistake that produces a confusing generic 400/404 or,
// worse, a request sent to the wrong URL (e.g. `/v1/objects/undefined`).

/** A non-empty string used as a path segment (an id, a slug, an env name, ...). */
export function requireId(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PageWeaverInvalidRequestError(
      `\`${name}\` is required and must be a non-empty string.`,
      name,
    );
  }
  return value;
}

/** A finite, positive integer (a version number, a chunk index + 1, a page seq, ...). */
export function requirePositiveInt(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new PageWeaverInvalidRequestError(`\`${name}\` must be a positive integer.`, name);
  }
  return value;
}

/** A non-negative integer (a chunk index, ...). */
export function requireNonNegativeInt(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new PageWeaverInvalidRequestError(`\`${name}\` must be a non-negative integer.`, name);
  }
  return value;
}

/** A plain JSON-serializable object body (not an array, not null, not a primitive). */
export function requireObjectBody(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PageWeaverInvalidRequestError(`\`${name}\` must be an object.`, name);
  }
  return value as Record<string, unknown>;
}

/** A required, non-empty string field on a params object. */
export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PageWeaverInvalidRequestError(
      `\`${name}\` is required and must be a non-empty string.`,
      name,
    );
  }
  return value;
}

/** A required array with at least one item. */
export function requireNonEmptyArray<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PageWeaverInvalidRequestError(`\`${name}\` must be a non-empty array.`, name);
  }
  return value as T[];
}

/** Assert that exactly one of two mutually-exclusive optional fields is set. */
export function requireOneOf(a: unknown, aName: string, b: unknown, bName: string): void {
  const hasA = a !== undefined && a !== null && a !== "";
  const hasB = b !== undefined && b !== null && b !== "";
  if (hasA === hasB) {
    throw new PageWeaverInvalidRequestError(
      `Provide exactly one of \`${aName}\` or \`${bName}\`.`,
    );
  }
}
