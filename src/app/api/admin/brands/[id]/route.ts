import { adminItemHandlers } from "@/server/http/admin-route";

/**
 * `GET|PUT|DELETE /api/admin/brands/{id}` (US7 T076, admin-api.md §3).
 * `brands:read|update|delete`; delete refused while published or referenced.
 */
export const { GET, PUT, DELETE } = adminItemHandlers("brands");
