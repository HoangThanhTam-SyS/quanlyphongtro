"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building2,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  UserCog,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useUserRole } from "@/hooks/use-user-role"
import { cn } from "@/lib/utils"
import { createSupabaseClient } from "@/utils/supabase/client"

const navItems = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/rooms", label: "Phòng trọ", icon: DoorOpen },
  { href: "/khach-thue", label: "Khách thuê", icon: Users },
  { href: "/tinh-tien", label: "Tính tiền", icon: Receipt },
] as const

const adminNavItems = [
  { href: "/settings", label: "Cấu hình", icon: Settings },
  { href: "/users", label: "Quản lý User", icon: UserCog },
] as const

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLinks({
  className,
  role,
  onNavigate,
}: {
  className?: string
  role: "admin" | "staff" | null
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  function renderLink(item: {
    href: string
    label: string
    icon: typeof LayoutDashboard
  }) {
    const active = isActive(pathname, item.href)
    const Icon = item.icon

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
          active &&
            "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <nav className={cn("flex gap-1", className)}>
      {navItems.map((item) => renderLink(item))}
      {role === "admin"
        ? adminNavItems.map((item) => renderLink(item))
        : null}
    </nav>
  )
}

function SidebarAccount() {
  const [email, setEmail] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseClient()
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  async function logout() {
    setSigningOut(true)
    const { error } = await createSupabaseClient().auth.signOut()
    if (error) {
      setSigningOut(false)
      return
    }
    window.location.href = "/login"
  }

  return (
    <div className="mt-auto border-t border-sidebar-border p-3">
      <p className="truncate px-2 text-xs text-muted-foreground">
        {email ?? "Đang tải tài khoản..."}
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-2 w-full"
        disabled={signingOut}
        onClick={() => void logout()}
      >
        <LogOut />
        {signingOut ? "Đang đăng xuất..." : "Đăng xuất"}
      </Button>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { role } = useUserRole()
  const [hostelName, setHostelName] = useState("Hệ thống quản lý")
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchHostelName() {
      const { data, error } = await createSupabaseClient()
        .from("settings")
        .select("hostel_name")
        .eq("id", 1)
        .maybeSingle()
      if (cancelled || error) return
      const name =
        typeof data?.hostel_name === "string" ? data.hostel_name.trim() : ""
      setHostelName(name || "Hệ thống quản lý")
    }

    void fetchHostelName()
    window.addEventListener("settingsUpdated", fetchHostelName)

    return () => {
      cancelled = true
      window.removeEventListener("settingsUpdated", fetchHostelName)
    }
  }, [])

  if (pathname === "/login" || pathname.startsWith("/pay")) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              Quản lý phòng trọ
            </p>
            <p className="truncate text-xs text-muted-foreground">{hostelName}</p>
          </div>
        </div>
        <NavLinks className="flex-col px-3" role={role} />
        <SidebarAccount />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 py-2 md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Mở menu"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 max-w-[85vw] gap-0 bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetHeader className="border-b border-sidebar-border">
                <SheetTitle className="truncate">Quản lý phòng trọ</SheetTitle>
                <SheetDescription className="truncate">
                  {hostelName}
                </SheetDescription>
              </SheetHeader>
              <NavLinks
                className="flex-col px-3 py-3"
                role={role}
                onNavigate={() => setMenuOpen(false)}
              />
              <SidebarAccount />
            </SheetContent>
          </Sheet>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            {hostelName}
          </p>
        </header>
        <main className="w-full flex-1 overflow-x-hidden p-2 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
