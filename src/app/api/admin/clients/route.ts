import { adminCollectionHandlers } from "@/server/http/admin-route";

/**
 * `GET|POST /api/admin/clients` (US7 T080, admin-api.md §3, FR-029).
 * `clients:read` / `clients:create` — SalesBusiness full lifecycle.
 */
export const { GET, POST } = adminCollectionHandlers("clients");
