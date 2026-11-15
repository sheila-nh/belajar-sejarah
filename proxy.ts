import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = (session?.user as { role?: string })?.role;

  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isAdminPath = pathname.startsWith("/admin");
  const isStudentPath = pathname.startsWith("/student");

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (session && isPublic) {
    return NextResponse.redirect(
      new URL(role === "ADMIN" ? "/admin/dashboard" : "/student/dashboard", req.url)
    );
  }

  if (isAdminPath && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/student/dashboard", req.url));
  }

  if (isStudentPath && role !== "PELAJAR") {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
