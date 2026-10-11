import crypto from "node:crypto";

export function normalizeProductCode(value) {
  return String(value || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function modelKeyFromName(name) {
  const digest = crypto.createHash("sha256").update(String(name).trim()).digest("hex").slice(0, 16);
  return `name-${digest}`;
}

export function parseDimensions(value) {
  const original = String(value || "").replace(/cmin$/i, "cm").trim();
  const match = original.match(/([0-9]+(?:\.[0-9]+)?)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*cm/i);
  if (!match) return { original: original || null, heightMm: null, widthMm: null, depthMm: null };
  return { original, heightMm: Number(match[1]) * 10, widthMm: Number(match[2]) * 10, depthMm: Number(match[3]) * 10 };
}

export function originalCodeFromText(text, normalizedCode) {
  const escaped = normalizedCode.split("").join("[\\s-]*");
  return text.match(new RegExp(escaped, "i"))?.[0]?.replace(/\s+/g, "") || normalizedCode;
}
