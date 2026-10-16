import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import {
  createAdminEntity,
  deleteAdminEntity,
  getAdminEntity,
  isTransitionAction,
  listAdminEntities,
  transitionAdminEntity,
  updateAdminEntity,
  type AdminResource,
} from "@/server/services/admin";

/**
 * Route-handler factory for the six US7 admin resources (T076–T081,
 * admin-api.md §3). Each resource exposes the same REST surface so the six
 * route trees stay one-liners:
 *
 *   GET|POST   /api/admin/{resource}
 *   GET|PUT|DELETE /api/admin/{resource}/{id}
 *   POST       /api/admin/{resource}/{id}/{action}
 *
 * Handlers are deliberately thin: permission enforcement, payload validation,
 * optimistic locking and the activity log all live in `services/admin.ts`, so
 * there is a single governed path from HTTP to the database (§Constitution IV).
 */

type RouteContext<T extends Record<string, string> = { id: string }> = {
  params: Promise<T>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(id: string): void {
  if (!UUID_RE.test(id)) {
    throw notFound("Record not found");
  }
}

async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

export function adminCollectionHandlers(resource: AdminResource) {
  return {
    GET: async (request: Request) => {
      try {
        const url = new URL(request.url);
        const query = Object.fromEntries(url.searchParams.entries());
        return NextResponse.json(await listAdminEntities(resource, query));
      } catch (error) {
        return errorResponse(error);
      }
    },
    POST: async (request: Request) => {
      try {
        const created = await createAdminEntity(resource, await readJson(request));
        return NextResponse.json(created, { status: 201 });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

export function adminItemHandlers(resource: AdminResource) {
  return {
    GET: async (_request: Request, context: RouteContext) => {
      try {
        const { id } = await context.params;
        assertUuid(id);
        return NextResponse.json(await getAdminEntity(resource, id));
      } catch (error) {
        return errorResponse(error);
      }
    },
    PUT: async (request: Request, context: RouteContext) => {
      try {
        const { id } = await context.params;
        assertUuid(id);
        return NextResponse.json(await updateAdminEntity(resource, id, await readJson(request)));
      } catch (error) {
        return errorResponse(error);
      }
    },
    DELETE: async (_request: Request, context: RouteContext) => {
      try {
        const { id } = await context.params;
        assertUuid(id);
        return NextResponse.json(await deleteAdminEntity(resource, id));
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

export function adminActionHandlers(resource: AdminResource) {
  return {
    POST: async (request: Request, context: RouteContext<{ id: string; action: string }>) => {
      try {
        const { id, action } = await context.params;
        assertUuid(id);
        if (!isTransitionAction(action)) {
          throw notFound("Unknown action");
        }
        const body = await readOptionalJson(request);
        return NextResponse.json(await transitionAdminEntity(resource, id, action, body));
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
