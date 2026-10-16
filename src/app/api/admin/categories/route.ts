import { adminCollectionHandlers } from "@/server/http/admin-route";

/**
 * `GET|POST /api/admin/categories` (US7 T078, admin-api.md §3, FR-027).
 * `categories:read` / `categories:create` — ProductManager full lifecycle.
 */
export const { GET, POST } = adminCollectionHandlers("categories");
