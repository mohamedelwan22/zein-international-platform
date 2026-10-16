import { adminItemHandlers } from "@/server/http/admin-route";

/**
 * `GET|PUT|DELETE /api/admin/suppliers/{id}` (US7 T079, admin-api.md §3).
 * `suppliers:read|update|delete`; delete refused while published or referenced.
 */
export const { GET, PUT, DELETE } = adminItemHandlers("suppliers");
