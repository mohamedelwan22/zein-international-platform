import { adminActionHandlers } from "@/server/http/admin-route";

/**
 * `POST /api/admin/suppliers/{id}/{action}` (US7 T079, admin-api.md §3).
 * Actions: publish | unpublish | archive | restore | visibility.
 */
export const { POST } = adminActionHandlers("suppliers");
