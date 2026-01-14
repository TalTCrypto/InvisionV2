import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Le middleware Edge ne peut pas utiliser Prisma/Better Auth
  // La protection des routes se fait dans les pages serveur (dashboard, onboarding)
  // qui peuvent utiliser Prisma et Better Auth normalement

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
