/** ADR-060 comparison boundaries; save/ingestion keep their legacy defaults. */
export function portableTrim(value: string | null | undefined): string {
  return (value ?? "").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/** Compare canonical unsigned decimal strings without IEEE-754 conversion. */
export function compareDecimal(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return left === right ? 0 : left < right ? -1 : 1;
}

/** At most three ASCII digits; canonical domain is 0..150 inclusive. */
export function canonicalComparisonAge(raw: string): string | null {
  const value = portableTrim(raw);
  if (!/^[0-9]{1,3}$/.test(value)) return null;
  const canonical = value.replace(/^0+/, "") || "0";
  return compareDecimal(canonical, "150") <= 0 ? canonical : null;
}
