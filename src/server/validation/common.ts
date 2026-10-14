import { z } from "zod";

/**
 * Shared validation helpers (US12 T090/T091).
 *
 * `issueDetails` maps a ZodError to the contract `details[]` shape
 * (contracts/README.md §4). Issue `message`s are keys into the `validation`
 * message namespace, never user-facing strings (FR-003).
 */
export function issueDetails(error: z.ZodError): { path: string; issue: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "_",
    issue: issue.message,
  }));
}
