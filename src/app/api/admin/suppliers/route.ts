import { adminCollectionHandlers } from "@/server/http/admin-route";

/**
 * `GET|POST /api/admin/suppliers` (US7 T079, admin-api.md §3, FR-028).
 * `suppliers:read` / `suppliers:create` — ProductManager full lifecycle.
 */
export const { GET, POST } = adminCollectionHandlers("suppliers");
