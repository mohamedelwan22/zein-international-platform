/**
 * Public catalog media frame (FR-008/FR-009).
 *
 * Brand logos/covers and product images are stored as Media rows referenced by
 * id. The public URL strategy for media ("app-proxied path or signed/public
 * bucket URL") is owned by the media admin module and is finalized at T091
 * (`src/server/storage/config.ts`, `contracts/README.md` §9). Until a stable
 * URL exists this frame reserves the layout slot with a neutral, decorative
 * placeholder — it never emits a broken or invented image source.
 *
 * When T091 publishes media URLs, this component renders the real image for
 * the same `mediaId` without any caller change.
 */

export interface MediaImageProps {
  mediaId: string | null;
  /** Sizing / aspect classes for the frame (e.g. "aspect-[4/3] w-full"). */
  className?: string;
}

export function MediaImage({ mediaId, className = "" }: MediaImageProps) {
  if (!mediaId) return null;

  return (
    <div
      aria-hidden="true"
      className={`bg-gradient-to-br from-zain-green-950/10 via-zain-green-950/[0.04] to-zain-cream-100 ${className}`}
    />
  );
}
