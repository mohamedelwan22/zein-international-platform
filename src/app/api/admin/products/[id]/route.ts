import { adminItemHandlers } from "@/server/http/admin-route";

/**
 * `GET|PUT|DELETE /api/admin/products/{id}` (US7 T077, admin-api.md §3).
 * `products:read|update|delete`; delete refused while published or referenced.
 */
export const { GET, PUT, DELETE } = adminItemHandlers("products");
