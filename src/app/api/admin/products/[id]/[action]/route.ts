import { adminActionHandlers } from "@/server/http/admin-route";

/**
 * `POST /api/admin/products/{id}/{action}` (US7 T077, admin-api.md §3).
 * Actions: publish | unpublish | archive | restore | visibility.
 */
export const { POST } = adminActionHandlers("products");
