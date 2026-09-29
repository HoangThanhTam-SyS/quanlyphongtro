"use server"

import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

import { isAdminUser, readUserRole, type UserRole } from "@/lib/user-role"
import { getSupabaseAnonKey, getSupabaseUrl } from "@/utils/supabase/env"

export type AuthUserRow = {
  id: string
  email: string
  role: UserRole | null
  createdAt: string
  lastSignInAt: string | null
}

export type UsersPayload = {
  users: AuthUserRow[]
  currentUserId: string | null
}

type ActionResult = { ok: true; message: string } | { ok: false; message: string }

function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function publicError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? ""
  if (!message || /service_role|jwt|secret/i.test(message)) return fallback
  if (message.toLowerCase().includes("already been registered")) {
    return "Email này đã có tài khoản."
  }
  if (message.toLowerCase().includes("password")) {
    return "Mật khẩu chưa đủ mạnh. Hãy dùng ít nhất 6 ký tự."
  }
  return message
}

function parseRole(value: string): UserRole | null {
  if (value === "admin" || value === "staff") return value
  return null
}

async function requireAdminUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {},
    },
  })
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user || !isAdminUser(user)) return null
  return user
}

export async function listAuthUsers(): Promise<
  { ok: true; data: UsersPayload } | { ok: false; message: string }
> {
  const currentUser = await requireAdminUser()
  if (!currentUser) {
    return { ok: false, message: "Bạn không có quyền quản lý tài khoản." }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    if (error) {
      return { ok: false, message: publicError(error, "Không tải được danh sách tài khoản.") }
    }

    const users = (data.users ?? [])
      .map((user) => ({
        id: user.id,
        email: user.email ?? "—",
        role: readUserRole(user),
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return { ok: true, data: { users, currentUserId: currentUser.id } }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? publicError(error, "Không tải được danh sách tài khoản.") : "Không tải được danh sách tài khoản.",
    }
  }
}

export async function createAuthUser(input: {
  email: string
  password: string
  role: string
}): Promise<ActionResult> {
  const currentUser = await requireAdminUser()
  if (!currentUser) {
    return { ok: false, message: "Bạn không có quyền quản lý tài khoản." }
  }

  const email = input.email.trim()
  const password = input.password
  const role = parseRole(input.role)
  if (!email || !password) {
    return { ok: false, message: "Vui lòng nhập email và mật khẩu." }
  }
  if (!role) {
    return { ok: false, message: "Vui lòng chọn vai trò." }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
      app_metadata: { role },
    })
    if (error) {
      return { ok: false, message: publicError(error, "Không tạo được tài khoản.") }
    }
    return { ok: true, message: "Đã tạo tài khoản." }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? publicError(error, "Không tạo được tài khoản.") : "Không tạo được tài khoản.",
    }
  }
}

export async function updateAuthUserRole(input: {
  id: string
  role: string
}): Promise<ActionResult> {
  const currentUser = await requireAdminUser()
  if (!currentUser) {
    return { ok: false, message: "Bạn không có quyền quản lý tài khoản." }
  }

  const role = parseRole(input.role)
  if (!input.id || !role) {
    return { ok: false, message: "Vui lòng chọn vai trò." }
  }
  if (input.id === currentUser.id && role !== "admin") {
    return { ok: false, message: "Không thể đổi vai trò của tài khoản đang đăng nhập." }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(input.id, {
      user_metadata: { role },
      app_metadata: { role },
    })
    if (error) {
      return { ok: false, message: publicError(error, "Không cập nhật được vai trò.") }
    }
    return { ok: true, message: "Đã cập nhật vai trò." }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? publicError(error, "Không cập nhật được vai trò.")
          : "Không cập nhật được vai trò.",
    }
  }
}

export async function updateAuthUserPassword(input: {
  id: string
  password: string
}): Promise<ActionResult> {
  const currentUser = await requireAdminUser()
  if (!currentUser) {
    return { ok: false, message: "Bạn không có quyền quản lý tài khoản." }
  }

  if (!input.id || !input.password) {
    return { ok: false, message: "Vui lòng nhập mật khẩu mới." }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(input.id, {
      password: input.password,
    })
    if (error) {
      return { ok: false, message: publicError(error, "Không đổi được mật khẩu.") }
    }
    return { ok: true, message: "Đã đổi mật khẩu." }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? publicError(error, "Không đổi được mật khẩu.") : "Không đổi được mật khẩu.",
    }
  }
}

export async function deleteAuthUser(id: string): Promise<ActionResult> {
  const currentUser = await requireAdminUser()
  if (!currentUser) {
    return { ok: false, message: "Bạn không có quyền quản lý tài khoản." }
  }
  if (id === currentUser.id) {
    return { ok: false, message: "Không thể xóa tài khoản đang đăng nhập." }
  }
  if (!id) {
    return { ok: false, message: "Không xác định được tài khoản cần xóa." }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) {
      return { ok: false, message: publicError(error, "Không xóa được tài khoản.") }
    }
    return { ok: true, message: "Đã xóa tài khoản." }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? publicError(error, "Không xóa được tài khoản.") : "Không xóa được tài khoản.",
    }
  }
}
