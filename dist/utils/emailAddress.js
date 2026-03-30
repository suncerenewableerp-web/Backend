"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailLookupCandidates = emailLookupCandidates;
exports.normalizeEmailForStorage = normalizeEmailForStorage;
function toLowerTrim(v) {
    return String(v || "").trim().toLowerCase();
}
function canonicalizeGmailAddress(rawLower) {
    const at = rawLower.indexOf("@");
    if (at <= 0)
        return rawLower;
    let local = rawLower.slice(0, at);
    let domain = rawLower.slice(at + 1);
    if (!domain)
        return rawLower;
    if (domain === "googlemail.com")
        domain = "gmail.com";
    if (domain !== "gmail.com")
        return rawLower;
    // Gmail ignores dots in the local part and ignores anything after a '+'.
    local = local.split("+")[0] || "";
    local = local.replace(/\./g, "");
    if (!local)
        return rawLower;
    return `${local}@gmail.com`;
}
function emailLookupCandidates(input) {
    const rawLower = toLowerTrim(input);
    if (!rawLower)
        return [];
    const gmailCanonical = canonicalizeGmailAddress(rawLower);
    return Array.from(new Set([rawLower, gmailCanonical].filter(Boolean)));
}
function normalizeEmailForStorage(input) {
    const rawLower = toLowerTrim(input);
    if (!rawLower)
        return rawLower;
    return canonicalizeGmailAddress(rawLower);
}
