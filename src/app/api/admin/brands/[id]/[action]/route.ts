import { adminActionHandlers } from "@/server/http/admin-route";

/**
 * `POST /api/admin/brands/{id}/{action}` (US7 T076, admin-api.md §3).
 * Actions: publish | unpublish | archive | restore | visibility.
 */
export const { POST } = adminActionHandlers("brands");
