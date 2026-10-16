import { adminActionHandlers } from "@/server/http/admin-route";

/**
 * `POST /api/admin/clients/{id}/{action}` (US7 T080, admin-api.md §3).
 * Actions: publish | unpublish | archive | restore | visibility.
 */
export const { POST } = adminActionHandlers("clients");
