function toLowerTrim(v: unknown): string {
  return String(v || "").trim().toLowerCase();
}

function canonicalizeGmailAddress(rawLower: string): string {
  const at = rawLower.indexOf("@");
  if (at <= 0) return rawLower;
  let local = rawLower.slice(0, at);
  let domain = rawLower.slice(at + 1);
  if (!domain) return rawLower;

  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain !== "gmail.com") return rawLower;

  // Gmail ignores dots in the local part and ignores anything after a '+'.
  local = local.split("+")[0] || "";
  local = local.replace(/\./g, "");
  if (!local) return rawLower;
  return `${local}@gmail.com`;
}

export function emailLookupCandidates(input: unknown): string[] {
  const rawLower = toLowerTrim(input);
  if (!rawLower) return [];
  const gmailCanonical = canonicalizeGmailAddress(rawLower);
  return Array.from(new Set([rawLower, gmailCanonical].filter(Boolean)));
}

export function normalizeEmailForStorage(input: unknown): string {
  const rawLower = toLowerTrim(input);
  if (!rawLower) return rawLower;
  return canonicalizeGmailAddress(rawLower);
}

