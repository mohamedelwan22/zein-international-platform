import { adminCollectionHandlers } from "@/server/http/admin-route";

/**
 * `GET|POST /api/admin/products` (US7 T077, admin-api.md §3, FR-026).
 * `products:read` / `products:create` — ProductManager full lifecycle.
 */
export const { GET, POST } = adminCollectionHandlers("products");
