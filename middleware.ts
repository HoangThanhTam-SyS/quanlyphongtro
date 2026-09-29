import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isAdminUser } from "@/lib/user-role"
import { getSupabaseAnonKey, getSupabaseUrl } from "@/utils/supabase/env"

const PROTECTED_PREFIXES = [
  "/rooms",
  "/phong-tro",
  "/khach-thue",
  "/tenants",
  "/tinh-tien",
  "/bills",
  "/settings",
  "/users",
]

function isAdminOnlyPath(pathname: string) {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/users" ||
    pathname.startsWith("/users/")
  )
}

function isProtectedPath(pathname: string) {
  if (pathname === "/") return true
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie)
  })
  return to
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/pay" || pathname.startsWith("/pay/")) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  const user = data.user

  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    return copyCookies(supabaseResponse, NextResponse.redirect(url))
  }

  if (user && !isAdminUser(user) && isAdminOnlyPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return copyCookies(supabaseResponse, NextResponse.redirect(url))
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return copyCookies(supabaseResponse, NextResponse.redirect(url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
