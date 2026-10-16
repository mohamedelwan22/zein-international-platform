import { adminItemHandlers } from "@/server/http/admin-route";

/**
 * `GET|PUT|DELETE /api/admin/clients/{id}` (US7 T080, admin-api.md §3).
 * `clients:read|update|delete`; delete refused while published or referenced.
 */
export const { GET, PUT, DELETE } = adminItemHandlers("clients");
