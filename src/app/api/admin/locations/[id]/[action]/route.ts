import { adminActionHandlers } from "@/server/http/admin-route";

/**
 * `POST /api/admin/locations/{id}/{action}` (US7 T081, admin-api.md §3).
 * Actions: publish | unpublish | archive | restore | visibility.
 */
export const { POST } = adminActionHandlers("locations");
