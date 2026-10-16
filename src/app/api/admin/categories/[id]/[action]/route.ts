import { adminActionHandlers } from "@/server/http/admin-route";

/**
 * `POST /api/admin/categories/{id}/{action}` (US7 T078, admin-api.md §3).
 * Actions: publish | unpublish | archive | restore | visibility.
 */
export const { POST } = adminActionHandlers("categories");
