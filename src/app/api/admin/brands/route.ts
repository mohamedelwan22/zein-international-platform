import { adminCollectionHandlers } from "@/server/http/admin-route";

/**
 * `GET|POST /api/admin/brands` (US7 T076, admin-api.md §3, FR-025).
 * `brands:read` / `brands:create` — ProductManager full lifecycle.
 */
export const { GET, POST } = adminCollectionHandlers("brands");
