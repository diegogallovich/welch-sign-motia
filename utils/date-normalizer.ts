/**
 * Normalizes date strings to YYYY-MM-DD format for comparison purposes.
 * Handles various date formats including ISO 8601 with time/timezone components.
 *
 * @param dateString - Date string in various formats (e.g., "2024-12-15", "2024-12-15T00:00:00Z")
 * @returns Normalized date string in YYYY-MM-DD format, or empty string if invalid/empty
 *
 * @example
 * normalizeDateForComparison("2024-12-15") // "2024-12-15"
 * normalizeDateForComparison("2024-12-15T00:00:00Z") // "2024-12-15"
 * normalizeDateForComparison("2024-12-15T05:00:00.000Z") // "2024-12-15"
 * normalizeDateForComparison(null) // ""
 * normalizeDateForComparison("invalid") // ""
 */
export function normalizeDateForComparison(
  dateString: string | null | undefined
): string {
  // Handle null, undefined, or empty strings
  if (!dateString || dateString.trim() === "") {
    return "";
  }

  try {
    // If the string is already in YYYY-MM-DD format (no time component), return as-is
    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnlyRegex.test(dateString.trim())) {
      return dateString.trim();
    }

    // Parse the date string
    const date = new Date(dateString.trim());

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return "";
    }

    // Extract year, month, day in UTC to avoid timezone issues
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  } catch (error) {
    // Return empty string if parsing fails
    return "";
  }
}
