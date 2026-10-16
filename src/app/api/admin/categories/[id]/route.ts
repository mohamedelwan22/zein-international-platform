import { adminItemHandlers } from "@/server/http/admin-route";

/**
 * `GET|PUT|DELETE /api/admin/categories/{id}` (US7 T078, admin-api.md §3).
 * `categories:read|update|delete`; delete refused while published or referenced.
 */
export const { GET, PUT, DELETE } = adminItemHandlers("categories");
