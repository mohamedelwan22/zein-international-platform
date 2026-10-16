import { adminCollectionHandlers } from "@/server/http/admin-route";

/**
 * `GET|POST /api/admin/locations` (US7 T081, admin-api.md §3, FR-030).
 * `locations:read` / `locations:create` — ProductManager full lifecycle.
 */
export const { GET, POST } = adminCollectionHandlers("locations");
