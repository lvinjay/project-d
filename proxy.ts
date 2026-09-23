import { NextResponse, type NextRequest } from "next/server";

// Public production is read/recommend-only. All other APIs fail closed,
// including newly added routes. Local development keeps the admin pipeline.
const publicMethods: Record<string, string> = {
  "/api/category-profile": "GET",
  "/api/selected-five-manifest": "GET",
  "/api/catalog-products": "GET",
  "/api/advisor-recommendations": "POST",
  // These mixed routes enforce read-only modes inside their handlers.
  "/api/generate-product-scores": "POST",
  "/api/analyze-personal-preferences": "POST",
};

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const path = request.nextUrl.pathname.replace(/\/+$/, "");
  if (path === "/admin" || path.startsWith("/admin/")) {
    return new NextResponse(null, { status: 404 });
  }
  if (path === "/api" || path.startsWith("/api/")) {
    if (publicMethods[path] !== request.method) {
      return NextResponse.json({ success: false, message: "Not available." }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/api/:path*"] };
