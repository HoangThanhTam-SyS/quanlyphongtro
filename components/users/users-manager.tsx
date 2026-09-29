"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import {
  createAuthUser,
  deleteAuthUser,
  listAuthUsers,
  updateAuthUserPassword,
  updateAuthUserRole,
  type AuthUserRow,
} from "@/app/actions/users"
import { roleLabel, type UserRole } from "@/lib/user-role"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function RoleField({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string
  value: UserRole
  disabled?: boolean
  onChange: (role: UserRole) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Vai trò</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === "admin" || next === "staff") onChange(next)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Chọn vai trò" />
        </SelectTrigger>
        <SelectContent className="z-[70]" position="popper">
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="staff">Nhân viên</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function formatDateTime(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

export function UsersManager() {
  const [users, setUsers] = useState<AuthUserRow[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(
    null
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("staff")
  const [creating, setCreating] = useState(false)

  const [editTarget, setEditTarget] = useState<AuthUserRow | null>(null)
  const [editRole, setEditRole] = useState<UserRole>("staff")
  const [savingRole, setSavingRole] = useState(false)

  const [passwordTarget, setPasswordTarget] = useState<AuthUserRow | null>(null)
  const [nextPassword, setNextPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AuthUserRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const showToast = useCallback((tone: "success" | "error", message: string) => {
    setToast({ tone, message })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    const result = await listAuthUsers()
    if (!result.ok) {
      setUsers([])
      showToast("error", result.message)
      setIsLoading(false)
      return
    }
    setUsers(result.data.users)
    setCurrentUserId(result.data.currentUserId)
    setIsLoading(false)
  }, [showToast])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    const result = await createAuthUser({ email, password, role })
    setCreating(false)
    showToast(result.ok ? "success" : "error", result.message)
    if (!result.ok) return
    setCreateOpen(false)
    setEmail("")
    setPassword("")
    setRole("staff")
    await loadUsers()
  }

  async function handleRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editTarget) return
    setSavingRole(true)
    const result = await updateAuthUserRole({ id: editTarget.id, role: editRole })
    setSavingRole(false)
    showToast(result.ok ? "success" : "error", result.message)
    if (!result.ok) return
    setEditTarget(null)
    await loadUsers()
  }

  async function handlePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!passwordTarget) return
    setSavingPassword(true)
    const result = await updateAuthUserPassword({
      id: passwordTarget.id,
      password: nextPassword,
    })
    setSavingPassword(false)
    showToast(result.ok ? "success" : "error", result.message)
    if (!result.ok) return
    setPasswordTarget(null)
    setNextPassword("")
    setShowPassword(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteAuthUser(deleteTarget.id)
    setDeleting(false)
    showToast(result.ok ? "success" : "error", result.message)
    if (!result.ok) return
    setDeleteTarget(null)
    await loadUsers()
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {toast ? (
        <p
          role={toast.tone === "error" ? "alert" : "status"}
          className={
            toast.tone === "error"
              ? "fixed top-4 left-1/2 z-50 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-destructive/30 bg-background px-4 py-3 text-sm text-destructive shadow-lg"
              : "fixed top-4 left-1/2 z-50 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-border bg-background px-4 py-3 text-sm shadow-lg"
          }
        >
          {toast.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quản lý User</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tài khoản đăng nhập hệ thống trên Supabase Auth.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEmail("")
            setPassword("")
            setRole("staff")
            setCreateOpen(true)
          }}
        >
          <Plus />
          Thêm tài khoản
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Table className="max-md:table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead className="hidden md:table-cell">Ngày tạo</TableHead>
              <TableHead className="hidden md:table-cell">
                Lần đăng nhập cuối
              </TableHead>
              <TableHead className="w-[4.75rem] text-right md:w-auto">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 md:hidden">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Đang tải danh sách tài khoản...
                  </div>
                </TableCell>
                <TableCell colSpan={5} className="hidden h-24 md:table-cell">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Đang tải danh sách tài khoản...
                  </div>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-muted-foreground md:hidden">
                  Chưa có tài khoản.
                </TableCell>
                <TableCell
                  colSpan={5}
                  className="hidden h-24 text-muted-foreground md:table-cell"
                >
                  Chưa có tài khoản.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="max-w-0 truncate font-medium md:max-w-none">
                    {user.email}
                  </TableCell>
                  <TableCell>{roleLabel(user.role)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDateTime(user.createdAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDateTime(user.lastSignInAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-0 md:flex-nowrap md:gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-primary/10 hover:text-primary max-md:size-6"
                        aria-label={`Sửa vai trò ${user.email}`}
                        onClick={() => {
                          setEditRole(user.role ?? "staff")
                          setEditTarget(user)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-primary/10 hover:text-primary max-md:size-6"
                        aria-label={`Đổi mật khẩu ${user.email}`}
                        onClick={() => {
                          setNextPassword("")
                          setShowPassword(false)
                          setPasswordTarget(user)
                        }}
                      >
                        <KeyRound />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive max-md:size-6"
                        aria-label={`Xóa tài khoản ${user.email}`}
                        disabled={user.id === currentUserId}
                        onClick={() => setDeleteTarget(user)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={(next) => !creating && setCreateOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleCreate(event)}>
            <DialogHeader>
              <DialogTitle>Thêm tài khoản</DialogTitle>
              <DialogDescription>
                Tài khoản mới có thể đăng nhập ngay, không cần xác nhận email.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={creating}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="user-password">Mật khẩu</Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={creating}
              />
            </div>
            <RoleField id="user-role" value={role} disabled={creating} onChange={setRole} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Đang tạo..." : "Tạo tài khoản"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(next) => {
          if (savingRole) return
          if (!next) setEditTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleRole(event)}>
            <DialogHeader>
              <DialogTitle>Sửa tài khoản</DialogTitle>
              <DialogDescription>Đổi vai trò của {editTarget?.email}.</DialogDescription>
            </DialogHeader>
            <RoleField
              id="edit-user-role"
              value={editRole}
              disabled={savingRole}
              onChange={setEditRole}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={savingRole}
                onClick={() => setEditTarget(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={savingRole}>
                {savingRole ? "Đang lưu..." : "Lưu vai trò"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={passwordTarget !== null}
        onOpenChange={(next) => {
          if (savingPassword) return
          if (!next) {
            setPasswordTarget(null)
            setShowPassword(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handlePassword(event)}>
            <DialogHeader>
              <DialogTitle>Đổi mật khẩu</DialogTitle>
              <DialogDescription>
                Đặt mật khẩu mới cho {passwordTarget?.email}.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">Mật khẩu mới</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                  className="pr-9"
                  required
                  disabled={savingPassword}
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={savingPassword}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={savingPassword}
                onClick={() => setPasswordTarget(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? "Đang lưu..." : "Lưu mật khẩu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (deleting) return
          if (!next) setDeleteTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa tài khoản</DialogTitle>
            <DialogDescription>
              Xóa {deleteTarget?.email}? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "Đang xóa..." : "Xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
