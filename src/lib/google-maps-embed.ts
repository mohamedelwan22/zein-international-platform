export const GOOGLE_MAPS_EMBED_MAX_LENGTH = 5000;

const IFRAME_OPEN_TAG = /^<iframe\b[^>]*>/i;
const IFRAME_SRC_ATTRIBUTE =
  /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

function decodeHtmlAmpersands(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&#x0*26;/gi, "&");
}

/**
 * Accept the URL alone, or the common partial paste where the opening
 * `<iframe src="` was missed and the URL is followed by the remaining
 * attributes. The URL token is validated below; trailing markup is ignored.
 */
function extractUrlToken(value: string): string | null {
  let candidate = value;
  if (/^src\s*=/i.test(candidate)) {
    candidate = candidate.replace(/^src\s*=\s*/i, "");
    if (candidate.startsWith('"') || candidate.startsWith("'")) {
      candidate = candidate.slice(1);
    }
  }
  const end = candidate.search(/[\s"'<>]/);
  if (end !== -1) candidate = candidate.slice(0, end);
  candidate = decodeHtmlAmpersands(candidate).trim();
  return candidate.length > 0 ? candidate : null;
}

/**
 * Staff can paste either the `src` URL or the complete iframe snippet from
 * Google Maps. Only the opening tag is inspected and its `src` value is
 * extracted; the snippet itself is never stored or rendered as HTML.
 */
function extractIframeSrc(value: string): string | null {
  if (!value.startsWith("<")) return extractUrlToken(value);
  const tag = value.match(IFRAME_OPEN_TAG)?.[0];
  if (!tag) return null;
  const match = tag.match(IFRAME_SRC_ATTRIBUTE);
  const src = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!src) return null;
  return decodeHtmlAmpersands(src).trim();
}

function isGoogleMapsEmbedUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;

  const host = url.hostname.toLowerCase();

  if (host === "www.google.com" || host === "google.com") {
    return (
      url.pathname === "/maps/embed" ||
      url.pathname.startsWith("/maps/embed/") ||
      url.pathname === "/maps/d/embed"
    );
  }

  if (host === "maps.google.com") {
    return url.pathname === "/maps" && url.searchParams.get("output") === "embed";
  }

  return false;
}

/**
 * Admin input is validated at the API boundary, but public reads re-check the
 * stored value so an invalid legacy/direct-database row can never become an
 * iframe source. Accepts a Google Maps embed URL or a pasted iframe snippet and
 * returns the normalized `src` URL, or null when it is not an official Google
 * Maps embed.
 */
export function normalizeGoogleMapsEmbedUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > GOOGLE_MAPS_EMBED_MAX_LENGTH) return null;
  const src = extractIframeSrc(trimmed);
  return src && isGoogleMapsEmbedUrl(src) ? src : null;
}

/** Address-only fallback: a search link, never invented coordinates. */
export function buildGoogleMapsSearchUrl(city: string, address: string): string {
  const params = new URLSearchParams({ api: "1", query: `${city}, ${address}` });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
