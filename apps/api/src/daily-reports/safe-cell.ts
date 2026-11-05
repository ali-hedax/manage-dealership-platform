/**
 * Text for exported spreadsheet cells. A value that a spreadsheet could read
 * as a formula (=, +, @, tab, CR, or "-" not followed by a digit) gets a
 * leading apostrophe; codes and numbers such as "-1" or "0012" are unchanged.
 */
export function safeCell(value: string): string {
  return /^[=+@\t\r]|^-(?!\d)/.test(value) ? `'${value}` : value;
}
