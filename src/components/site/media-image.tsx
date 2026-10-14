import Image from "next/image";

/**
 * Public catalog media frame (FR-008/FR-009, US12 T091).
 *
 * Brand logos/covers and product images are stored as Media rows referenced by
 * id. The public URL strategy (app-proxied `GET /api/media/{id}`) is owned by
 * the media service (`server/services/media.ts`, `publicMediaUrl`), so this
 * component renders the real bytes for a `mediaId` without the caller knowing
 * where media lives. A neutral placeholder frame shows while a row has no
 * media so the layout slot never collapses.
 */

export interface MediaImageProps {
  mediaId: string | null;
  /** Sizing / aspect classes for the frame (e.g. "aspect-[4/3] w-full"). */
  className?: string;
  /** Accessible description; empty means decorative. */
  alt?: string;
  /** Responsive sizes hint for the image optimizer. */
  sizes?: string;
  priority?: boolean;
  fit?: "cover" | "contain";
}

export function MediaImage({
  mediaId,
  className = "",
  alt = "",
  sizes = "(max-width: 768px) 100vw, 50vw",
  priority = false,
  fit = "cover",
}: MediaImageProps) {
  if (!mediaId) return null;

  return (
    <div className={`relative overflow-hidden bg-zain-cream-100 ${className}`}>
      <Image
        src={`/api/media/${mediaId}`}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={fit === "contain" ? "object-contain" : "object-cover"}
      />
    </div>
  );
}
