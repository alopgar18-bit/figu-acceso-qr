import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

function isPublicConfirmationPath(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return (
    pathname === "/c" ||
    pathname.startsWith("/c/") ||
    pathname === "/og" ||
    pathname.startsWith("/og/")
  );
}

const publicConfirmationRouteMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (isPublicConfirmationPath(request)) {
    return next({ context: { skipAuth: true, publicRoute: true } });
  }
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [publicConfirmationRouteMiddleware, errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
