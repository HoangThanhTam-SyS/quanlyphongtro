"use client"

import { useCallback, useEffect, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { useUserRole } from "@/hooks/use-user-role"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { formatMoneyInput, parseMoneyInput } from "@/lib/money-input"
import { createSupabaseClient } from "@/utils/supabase/client"

const ROOM_STATUSES = ["trống", "đang thuê", "đang sửa"] as const

type RoomStatus = (typeof ROOM_STATUSES)[number]

type Room = {
  id: string
  room_number: string
  floor: number
  area: number
  price: number
  status: string
}

type RoomForm = {
  roomNumber: string
  floor: string
  area: string
  price: string
  status: RoomStatus
}

const emptyForm: RoomForm = {
  roomNumber: "",
  floor: "",
  area: "",
  price: "",
  status: "trống",
}

const statusLabel: Record<RoomStatus, string> = {
  trống: "Trống",
  "đang thuê": "Đang thuê",
  "đang sửa": "Đang sửa",
}

function isRoomStatus(value: string): value is RoomStatus {
  return (ROOM_STATUSES as readonly string[]).includes(value)
}

function toNumber(value: number | string | null) {
  if (value === null) return 0
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatArea(value: number) {
  return `${new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(value)} m²`
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

function statusClassName(status: string) {
  if (status === "đang thuê") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-200"
  }
  if (status === "đang sửa") {
    return "bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-200"
  }
  return "bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-200"
}

function describeSupabaseError(error: {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}) {
  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" — ")
}

function roomWriteErrorMessage(error: {
  message?: string
  code?: string
}) {
  if (error.code === "23505") {
    return "Số phòng này đã tồn tại."
  }
  if (
    error.code === "42501" ||
    error.message?.toLowerCase().includes("row-level security")
  ) {
    return "Supabase đang chặn ghi phòng vì bảng rooms bật Row Level Security mà chưa có chính sách cho phép. Hãy chạy đoạn rooms_admin_all ở cuối file database.sql, rồi thử lại."
  }
  return error.message || "Không lưu được phòng. Vui lòng thử lại."
}

function roomDeleteErrorMessage(error: { message?: string; code?: string }) {
  if (
    error.code === "23503" ||
    error.message?.toLowerCase().includes("foreign key")
  ) {
    return "Không thể xóa phòng đang có dữ liệu khách thuê/hóa đơn"
  }
  if (
    error.code === "42501" ||
    error.message?.toLowerCase().includes("row-level security")
  ) {
    return "Supabase đang chặn xóa phòng vì bảng rooms bật Row Level Security mà chưa có chính sách cho phép."
  }
  return error.message || "Không xóa được phòng. Vui lòng thử lại."
}

export function RoomsManager() {
  const { role, isAdmin } = useUserRole()
  const showRoomActions = role === "admin"
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<RoomForm>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [listSuccess, setListSuccess] = useState<string | null>(null)

  const loadRooms = useCallback(async () => {
    setLoading(true)
    setListError(null)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_number, floor, area, price, status")
        .order("floor", { ascending: true })
        .order("room_number", { ascending: true })

      if (error) {
        console.error("Không tải được danh sách phòng:", error)
        setListError("Không tải được danh sách phòng. Vui lòng thử lại.")
        setRooms([])
        return
      }

      setRooms(
        (data ?? []).map((room) => ({
          id: room.id,
          room_number: room.room_number,
          floor: toNumber(room.floor),
          area: toNumber(room.area),
          price: toNumber(room.price),
          status: room.status,
        }))
      )
    } catch (error) {
      console.error("Không tải được danh sách phòng:", error)
      setListError(
        error instanceof Error
          ? error.message
          : "Không tải được danh sách phòng. Vui lòng thử lại."
      )
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  function handleOpenChange(next: boolean) {
    if (submitting) return
    setOpen(next)
    if (!next) {
      setEditingId(null)
      setForm(emptyForm)
      setFormError(null)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setOpen(true)
  }

  function openEdit(room: Room) {
    setEditingId(room.id)
    setForm({
      roomNumber: room.room_number,
      floor: String(room.floor),
      area: String(room.area),
      price: formatMoneyInput(room.price),
      status: isRoomStatus(room.status) ? room.status : "trống",
    })
    setFormError(null)
    setOpen(true)
  }

  function openDelete(room: Room) {
    setDeleteError(null)
    setDeleteTarget(room)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const roomNumber = form.roomNumber.trim()
    const floor = Number(form.floor)
    const area = Number(form.area)
    const parsedPrice = parseMoneyInput(form.price)
    const originalRoom = editingId ? rooms.find((room) => room.id === editingId) : undefined
    const price =
      !isAdmin && originalRoom ? Number(originalRoom.price) : parsedPrice

    if (!roomNumber) {
      setFormError("Vui lòng nhập số phòng.")
      return
    }
    if (!Number.isInteger(floor) || floor < 0) {
      setFormError("Tầng phải là số nguyên từ 0 trở lên.")
      return
    }
    if (!Number.isFinite(area) || area <= 0) {
      setFormError("Diện tích phải lớn hơn 0.")
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError("Giá thuê phải là số không âm.")
      return
    }

    setSubmitting(true)

    try {
      const supabase = createSupabaseClient()
      const payload = {
        room_number: roomNumber,
        floor,
        area,
        price: Math.round(price),
        status: form.status,
      }
      const query = editingId
        ? supabase.from("rooms").update(payload).eq("id", editingId).select("id")
        : supabase.from("rooms").insert(payload).select("id")
      const { data, error } = await query

      if (error) {
        console.error(`Không lưu được phòng: ${describeSupabaseError(error)}`)
        setFormError(roomWriteErrorMessage(error))
        return
      }

      if (!data?.length) {
        setFormError(
          "Không lưu được phòng. Hãy kiểm tra quyền ghi của bảng rooms."
        )
        return
      }

      setEditingId(null)
      setOpen(false)
      setForm(emptyForm)
      await loadRooms()
    } catch (error) {
      console.error("Không lưu được phòng:", error)
      setFormError(
        error instanceof Error
          ? error.message
          : "Không lưu được phòng. Vui lòng thử lại."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("rooms")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id")

      if (error) {
        console.log(`Không xóa được phòng: ${describeSupabaseError(error)}`)
        setDeleteError(roomDeleteErrorMessage(error))
        return
      }

      if (!data?.length) {
        setDeleteError(
          "Không xóa được phòng. Hãy kiểm tra quyền ghi của bảng rooms."
        )
        return
      }

      setDeleteTarget(null)
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id))
      await loadRooms()
    } catch (error) {
      console.error("Không xóa được phòng:", error)
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Không xóa được phòng. Vui lòng thử lại."
      )
    } finally {
      setDeleting(false)
    }
  }

  const visibleRoomIds = rooms.map((room) => room.id)
  const visibleRoomKey = visibleRoomIds.join("|")

  useEffect(() => {
    const visible = new Set(visibleRoomKey.split("|").filter(Boolean))
    setSelectedIds((current) => {
      const next = current.filter((id) => visible.has(id))
      return next.length === current.length ? current : next
    })
  }, [visibleRoomKey])

  const allRoomsSelected =
    visibleRoomIds.length > 0 &&
    visibleRoomIds.every((id) => selectedIds.includes(id))
  const someRoomsSelected = visibleRoomIds.some((id) => selectedIds.includes(id))

  function toggleRoom(id: string) {
    setListSuccess(null)
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function toggleAllRooms() {
    setListSuccess(null)
    setSelectedIds((current) => {
      if (allRoomsSelected) {
        return current.filter((id) => !visibleRoomIds.includes(id))
      }
      return [...new Set([...current, ...visibleRoomIds])]
    })
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    setBulkDeleting(true)
    setBulkError(null)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("rooms")
        .delete()
        .in("id", selectedIds)
        .select("id")

      if (error) {
        console.log(`Không xóa được phòng: ${describeSupabaseError(error)}`)
        setBulkError(
          error.code === "23503" ||
            error.message?.toLowerCase().includes("foreign key")
            ? "Không thể xóa các phòng đang có dữ liệu liên quan"
            : roomDeleteErrorMessage(error)
        )
        return
      }

      if (!data?.length) {
        setBulkError(
          "Không xóa được phòng. Hãy kiểm tra quyền ghi của bảng rooms."
        )
        return
      }

      setListSuccess(`Đã xóa ${data.length} dữ liệu.`)
      setSelectedIds([])
      setBulkOpen(false)
      await loadRooms()
    } catch (error) {
      console.log("Không xóa được phòng:", error)
      const message = error instanceof Error ? error.message.toLowerCase() : ""
      setBulkError(
        message.includes("foreign key") || message.includes("23503")
          ? "Không thể xóa các phòng đang có dữ liệu liên quan"
          : "Không xóa được phòng. Vui lòng thử lại."
      )
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Phòng trọ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Danh sách phòng, giá thuê và trạng thái trống, đang thuê hoặc đang
            sửa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && selectedIds.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setBulkError(null)
                setBulkOpen(true)
              }}
            >
              Xóa ({selectedIds.length}) dòng đã chọn
            </Button>
          ) : null}
          {role === "admin" ? (
            <Button type="button" onClick={openCreate}>
              <Plus />
              Thêm phòng mới
            </Button>
          ) : null}
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-md">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Sửa phòng" : "Thêm phòng mới"}
                </DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Cập nhật thông tin phòng đã chọn."
                    : "Nhập thông tin phòng. Trạng thái mặc định là Trống."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="room-number">Số phòng</Label>
                <Input
                  id="room-number"
                  value={form.roomNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      roomNumber: event.target.value,
                    }))
                  }
                  placeholder="Ví dụ: A101"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="floor">Tầng</Label>
                  <Input
                    id="floor"
                    type="number"
                    min={0}
                    step={1}
                    value={form.floor}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        floor: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="area">Diện tích (m²)</Label>
                  <Input
                    id="area"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={form.area}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        area: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="price">Giá thuê (đồng)</Label>
                <Input
                  id="price"
                  type="text"
                  inputMode="numeric"
                  value={form.price}
                  disabled={!isAdmin && Boolean(editingId)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      price: formatMoneyInput(event.target.value),
                    }))
                  }
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Trạng thái</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => {
                    if (!isRoomStatus(value)) return
                    setForm((current) => ({ ...current, status: value }))
                  }}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent className="z-[70]" position="popper">
                    {ROOM_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabel[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formError ? (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitting}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || (!isAdmin && Boolean(editingId))}
                >
                  {submitting ? "Đang lưu..." : "Lưu phòng"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={deleteTarget !== null}
          onOpenChange={(next) => {
            if (deleting) return
            if (!next) {
              setDeleteTarget(null)
              setDeleteError(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Xóa phòng</DialogTitle>
              <DialogDescription>
                Xóa phòng {deleteTarget?.room_number}? Thao tác này không hoàn
                tác được.
              </DialogDescription>
            </DialogHeader>
            {deleteError ? (
              <p className="text-sm text-destructive" role="alert">
                {deleteError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => {
                  setDeleteTarget(null)
                  setDeleteError(null)
                }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? "Đang xóa..." : "Xóa phòng"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={bulkOpen}
          onOpenChange={(next) => {
            if (bulkDeleting) return
            setBulkOpen(next)
            if (!next) setBulkError(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Xóa phòng đã chọn</DialogTitle>
              <DialogDescription>
                Bạn có chắc chắn muốn xóa {selectedIds.length} dữ liệu đã chọn
                không? Hành động này không thể hoàn tác.
              </DialogDescription>
            </DialogHeader>
            {bulkError ? (
              <p className="text-sm text-destructive" role="alert">
                {bulkError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={bulkDeleting}
                onClick={() => {
                  setBulkOpen(false)
                  setBulkError(null)
                }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={bulkDeleting}
                onClick={() => void handleBulkDelete()}
              >
                {bulkDeleting ? "Đang xóa..." : "Xóa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {listError ? (
        <p className="text-sm text-destructive" role="alert">
          {listError}
        </p>
      ) : null}
      {listSuccess ? (
        <p className="text-sm text-green-700" role="status">
          {listSuccess}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Table className="max-md:table-fixed">
          <TableHeader>
            <TableRow>
              {isAdmin ? (
                <TableHead className="hidden w-10 md:table-cell">
                  <Checkbox
                    checked={allRoomsSelected}
                    indeterminate={someRoomsSelected && !allRoomsSelected}
                    disabled={rooms.length === 0}
                    onChange={toggleAllRooms}
                    aria-label="Chọn tất cả phòng đang hiển thị"
                  />
                </TableHead>
              ) : null}
              <TableHead>Số phòng</TableHead>
              <TableHead className="hidden md:table-cell">Tầng</TableHead>
              <TableHead className="hidden md:table-cell">Diện tích</TableHead>
              <TableHead className="w-[34%] md:w-auto">Giá thuê</TableHead>
              <TableHead>Trạng thái</TableHead>
              {showRoomActions ? (
                <TableHead className="w-[4.25rem] text-right md:w-auto">
                  Thao tác
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={showRoomActions ? 4 : 3}
                  className="h-24 text-muted-foreground md:hidden"
                >
                  Đang tải danh sách phòng...
                </TableCell>
                <TableCell
                  colSpan={showRoomActions ? 7 : 5}
                  className="hidden h-24 text-muted-foreground md:table-cell"
                >
                  Đang tải danh sách phòng...
                </TableCell>
              </TableRow>
            ) : rooms.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showRoomActions ? 4 : 3}
                  className="h-24 text-muted-foreground md:hidden"
                >
                  Chưa có phòng nào. Hãy thêm phòng mới.
                </TableCell>
                <TableCell
                  colSpan={showRoomActions ? 7 : 5}
                  className="hidden h-24 text-muted-foreground md:table-cell"
                >
                  Chưa có phòng nào. Hãy thêm phòng mới.
                </TableCell>
              </TableRow>
            ) : (
              rooms.map((room) => (
                <TableRow key={room.id}>
                  {isAdmin ? (
                    <TableCell className="hidden md:table-cell">
                      <Checkbox
                        checked={selectedIds.includes(room.id)}
                        onChange={() => toggleRoom(room.id)}
                        aria-label={`Chọn phòng ${room.room_number}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="font-medium">
                    {room.room_number}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{room.floor}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatArea(room.area)}
                  </TableCell>
                  <TableCell>{formatPrice(room.price)}</TableCell>
                  <TableCell>
                    <Badge className={`${statusClassName(room.status)} max-md:px-1`}>
                      {isRoomStatus(room.status)
                        ? statusLabel[room.status]
                        : room.status}
                    </Badge>
                  </TableCell>
                  {showRoomActions ? (
                    <TableCell>
                      <div className="flex justify-end gap-0.5 md:gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-primary/10 hover:text-primary max-md:size-6"
                          aria-label={`Sửa phòng ${room.room_number}`}
                          onClick={() => openEdit(room)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive max-md:size-6"
                          aria-label={`Xóa phòng ${room.room_number}`}
                          onClick={() => openDelete(room)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
