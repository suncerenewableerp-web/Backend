import { cloudinary, ensureCloudinaryConfigured } from "../config/cloudinary";

function parseCloudinaryPublicUrl(input: string): null | {
  cloudName: string;
  resourceType: string;
  deliveryType: string;
  publicId: string;
  format: string;
} {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }

  if (!u.hostname || !u.hostname.endsWith("res.cloudinary.com")) return null;

  const parts = u.pathname.split("/").filter(Boolean);
  // Expected:
  // /<cloud_name>/<resource_type>/<delivery_type>/<optional transformations>/<v123>/<public_id>.<format>
  if (parts.length < 5) return null;

  const cloudName = parts[0] || "";
  const resourceType = parts[1] || "";
  const deliveryType = parts[2] || "";
  if (!cloudName || !resourceType || !deliveryType) return null;

  const uploadIdx = 2;
  let versionIdx = -1;
  for (let i = uploadIdx + 1; i < parts.length; i += 1) {
    if (/^v\d+$/.test(parts[i])) {
      versionIdx = i;
      break;
    }
  }

  const publicPathParts = parts.slice((versionIdx === -1 ? uploadIdx : versionIdx) + 1);
  if (!publicPathParts.length) return null;

  const last = publicPathParts[publicPathParts.length - 1] || "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0 || dot === last.length - 1) return null;

  const format = last.slice(dot + 1);
  publicPathParts[publicPathParts.length - 1] = last.slice(0, dot);
  const publicId = publicPathParts.join("/");

  return { cloudName, resourceType, deliveryType, publicId, format };
}

export function toCloudinaryPrivateDownloadUrl(
  inputUrl: string,
  options?: { expiresInSeconds?: number; attachment?: boolean },
): string {
  const original = String(inputUrl || "");
  if (!original) return original;

  const parsed = parseCloudinaryPublicUrl(original);
  if (!parsed) return original;

  const envCloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  if (envCloudName && parsed.cloudName && envCloudName !== parsed.cloudName) return original;

  try {
    ensureCloudinaryConfigured();
  } catch {
    return original;
  }

  const expiresInSeconds = Math.max(60, Number(options?.expiresInSeconds || 600));
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return cloudinary.utils.private_download_url(parsed.publicId, parsed.format, {
    resource_type: parsed.resourceType as any,
    type: parsed.deliveryType as any,
    expires_at: expiresAt,
    attachment: options?.attachment ? true : undefined,
  });
}

export function mapCloudinaryDocUrls(
  urls: unknown,
  options?: { expiresInSeconds?: number; attachment?: boolean },
): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((u) => toCloudinaryPrivateDownloadUrl(u, options));
}

