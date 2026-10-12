import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api";

/** A readable message for any error thrown by an API call. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

/**
 * Puts the API's field validation errors onto the matching form fields.
 * Returns the message to show at the top of the form (or null if every error was placed on a field).
 */
export function applyApiErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): string | null {
  if (!(error instanceof ApiError)) return errorMessage(error);
  const fieldErrors = error.details?.fieldErrors;
  if (!fieldErrors || Object.keys(fieldErrors).length === 0) return error.message;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    setError(field as Path<T>, { message: messages[0] });
  }
  return null;
}

/** Turn "" into null so optional fields are cleared rather than saved as empty strings. */
export function emptyToNull<T extends object>(values: T): T {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === "" ? null : v])) as T;
}
