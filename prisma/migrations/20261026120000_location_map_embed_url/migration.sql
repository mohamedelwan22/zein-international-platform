-- Optional staff-supplied Google Maps embed URL for a location.
-- Coordinates remain the source for map pins; this only controls the
-- per-location responsive embed on the public geographic-presence page.

ALTER TABLE "Location" ADD COLUMN "mapEmbedUrl" TEXT;
