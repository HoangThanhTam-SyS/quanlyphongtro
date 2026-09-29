export type UserRole = "admin" | "staff"

type RoleSource = {
  app_metadata?: object | null
  user_metadata?: object | null
} | null | undefined

function asRole(metadata: object | null | undefined): UserRole | null {
  if (!metadata || !("role" in metadata)) return null
  const value = (metadata as { role?: unknown }).role
  if (value === "admin" || value === "staff") return value
  return null
}

export function readUserRole(user: RoleSource): UserRole | null {
  const appRole = asRole(user?.app_metadata)
  if (appRole) return appRole
  return asRole(user?.user_metadata)
}

export function isAdminUser(user: RoleSource) {
  return readUserRole(user) === "admin"
}

export function roleLabel(role: UserRole | null) {
  if (role === "admin") return "Admin"
  if (role === "staff") return "Nhân viên"
  return "Chưa gán"
}
