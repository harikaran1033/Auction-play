export function creditsToUnits(input: string): number | undefined {
  if (!/^\d+(?:\.\d{0,2})?$/.test(input)) return undefined;
  const [whole, fraction = ""] = input.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : undefined;
}
