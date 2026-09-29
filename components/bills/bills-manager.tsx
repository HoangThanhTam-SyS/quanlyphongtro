"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Link2, Pencil, Plus, Trash2 } from "lucide-react"

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

type RentedRoom = {
  id: string
  room_number: string
  floor: number
  price: number
}

type Bill = {
  id: string
  month: number
  year: number
  roomNumber: string
  roomPrice: number
  electricOld: number
  electricNew: number
  waterOld: number
  waterNew: number
  totalAmount: number
  status: string
  createdAt: string
}

type BillEditForm = {
  electricOld: string
  electricNew: string
  waterOld: string
  waterNew: string
}

type BillForm = {
  roomId: string
  roomPrice: string
  month: string
  year: string
  electricOld: string
  electricNew: string
  waterOld: string
  waterNew: string
}

type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

function currentPeriod() {
  const now = new Date()
  return {
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
  }
}

function emptyForm(): BillForm {
  const period = currentPeriod()
  return {
    roomId: "",
    roomPrice: "",
    month: period.month,
    year: period.year,
    electricOld: "",
    electricNew: "",
    waterOld: "",
    waterNew: "",
  }
}

function toNumber(value: number | string | null) {
  if (value === null) return 0
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatMeter(oldValue: number, newValue: number) {
  const format = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })
  return `${format.format(oldValue)} → ${format.format(newValue)}`
}

function roomNumberFromJoin(
  rooms: { room_number: string } | { room_number: string }[] | null
) {
  if (!rooms) return "—"
  if (Array.isArray(rooms)) return rooms[0]?.room_number ?? "—"
  return rooms.room_number
}

function describeSupabaseError(error: SupabaseErrorLike) {
  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" — ")
}

const DUPLICATE_BILL_MESSAGE =
  "Thất bại! Phòng này đã được chốt điện nước trong tháng này. Vui lòng kiểm tra lại danh sách."

function isDuplicateBillMonth(error: SupabaseErrorLike) {
  const haystack = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
  return error.code === "23505" || haystack.includes("bills_room_month_key")
}

function billErrorMessage(error: SupabaseErrorLike) {
  if (isDuplicateBillMonth(error)) {
    return DUPLICATE_BILL_MESSAGE
  }
  if (error.code === "23514") {
    return "Chỉ số mới phải lớn hơn hoặc bằng chỉ số cũ."
  }
  if (
    error.code === "42501" ||
    error.message?.toLowerCase().includes("row-level security")
  ) {
    return "Supabase đang chặn vì bảng bills bật Row Level Security mà chưa có chính sách cho phép. Hãy chạy đoạn bills_admin_all ở cuối file database.sql, rồi thử lại."
  }
  return error.message || "Không tạo được hóa đơn. Vui lòng thử lại."
}

function compareBills(a: Bill, b: Bill) {
  const rank = (status: string) => (status === "chưa thanh toán" ? 0 : 1)
  const byStatus = rank(a.status) - rank(b.status)
  if (byStatus !== 0) return byStatus
  if (a.year !== b.year) return b.year - a.year
  if (a.month !== b.month) return b.month - a.month
  return b.createdAt.localeCompare(a.createdAt)
}

function statusClassName(status: string) {
  if (status === "đã thanh toán") {
    return "bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-200"
  }
  return "bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-200"
}

function statusLabel(status: string) {
  if (status === "đã thanh toán") return "Đã thanh toán"
  if (status === "chưa thanh toán") return "Chưa thanh toán"
  return status
}

export function BillsManager() {
  const { isAdmin } = useUserRole()
  const [bills, setBills] = useState<Bill[]>([])
  const [rentedRooms, setRentedRooms] = useState<RentedRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<BillForm>(emptyForm)
  const [editing, setEditing] = useState<Bill | null>(null)
  const [editForm, setEditForm] = useState<BillEditForm>({
    electricOld: "",
    electricNew: "",
    waterOld: "",
    waterNew: "",
  })
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [listSuccess, setListSuccess] = useState<string | null>(null)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [previousMetersLocked, setPreviousMetersLocked] = useState(false)
  const [loadingPreviousMeters, setLoadingPreviousMeters] = useState(false)
  const previousMeterRequest = useRef(0)

  const loadBills = useCallback(async () => {
    setLoading(true)
    setListError(null)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("bills")
        .select("*, rooms(room_number)")
        .order("year", { ascending: false })
        .order("month", { ascending: false })

      if (error) {
        console.error(`Không tải được hóa đơn: ${describeSupabaseError(error)}`)
        setListError("Không tải được danh sách hóa đơn. Vui lòng thử lại.")
        setBills([])
        return
      }

      setBills(
        (data ?? [])
          .map((bill) => ({
            id: bill.id,
            month: toNumber(bill.month),
            year: toNumber(bill.year),
            roomNumber: roomNumberFromJoin(bill.rooms),
            roomPrice: toNumber(bill.room_price),
            electricOld: toNumber(bill.electric_old),
            electricNew: toNumber(bill.electric_new),
            waterOld: toNumber(bill.water_old),
            waterNew: toNumber(bill.water_new),
            totalAmount: toNumber(bill.total_amount),
            status: bill.status,
            createdAt: typeof bill.created_at === "string" ? bill.created_at : "",
          }))
          .sort(compareBills)
      )
    } catch (error) {
      console.error("Không tải được hóa đơn:", error)
      setListError(
        error instanceof Error
          ? error.message
          : "Không tải được danh sách hóa đơn. Vui lòng thử lại."
      )
      setBills([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRentedRooms = useCallback(async () => {
    setLoadingRooms(true)
    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_number, floor, price")
        .eq("status", "đang thuê")
        .order("floor", { ascending: true })
        .order("room_number", { ascending: true })

      if (error) {
        console.error(
          `Không tải được phòng đang thuê: ${describeSupabaseError(error)}`
        )
        setRentedRooms([])
        setFormError("Không tải được danh sách phòng đang thuê.")
        return
      }

      setRentedRooms(
        (data ?? []).map((room) => ({
          id: room.id,
          room_number: room.room_number,
          floor: toNumber(room.floor),
          price: toNumber(room.price),
        }))
      )
    } catch (error) {
      console.error("Không tải được phòng đang thuê:", error)
      setRentedRooms([])
      setFormError(
        error instanceof Error
          ? error.message
          : "Không tải được danh sách phòng đang thuê."
      )
    } finally {
      setLoadingRooms(false)
    }
  }, [])

  useEffect(() => {
    void loadBills()
  }, [loadBills])

  function openCreate() {
    previousMeterRequest.current += 1
    setPreviousMetersLocked(false)
    setLoadingPreviousMeters(false)
    setForm(emptyForm())
    setFormError(null)
    setOpen(true)
    void loadRentedRooms()
  }

  function openEdit(bill: Bill) {
    setEditing(bill)
    setEditForm({
      electricOld: String(bill.electricOld),
      electricNew: String(bill.electricNew),
      waterOld: String(bill.waterOld),
      waterNew: String(bill.waterNew),
    })
    setEditError(null)
  }

  function meterValues(values: BillEditForm) {
    const electricOld = Number(values.electricOld)
    const electricNew = Number(values.electricNew)
    const waterOld = Number(values.waterOld)
    const waterNew = Number(values.waterNew)
    if (
      !Number.isFinite(electricOld) ||
      !Number.isFinite(electricNew) ||
      electricOld < 0 ||
      electricNew < electricOld
    ) {
      return "Số điện mới phải lớn hơn hoặc bằng số điện cũ."
    }
    if (
      !Number.isFinite(waterOld) ||
      !Number.isFinite(waterNew) ||
      waterOld < 0 ||
      waterNew < waterOld
    ) {
      return "Số nước mới phải lớn hơn hoặc bằng số nước cũ."
    }
    return null
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return
    previousMeterRequest.current += 1
    setPreviousMetersLocked(false)
    setLoadingPreviousMeters(false)
    setOpen(next)
    setForm(emptyForm())
    setFormError(null)
    if (next) void loadRentedRooms()
  }

  async function loadPreviousMeters(roomId: string, requestId: number) {
    setLoadingPreviousMeters(true)
    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("bills")
        .select("electric_new, water_new")
        .eq("room_id", roomId)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (requestId !== previousMeterRequest.current) return

      if (error) {
        console.log(
          `Không lấy được chỉ số kỳ trước: ${describeSupabaseError(error)}`
        )
        setPreviousMetersLocked(false)
        setFormError("Không lấy được chỉ số kỳ trước. Bạn vẫn có thể nhập số cũ.")
        return
      }

      if (data) {
        setForm((current) =>
          current.roomId === roomId
            ? {
                ...current,
                electricOld: String(toNumber(data.electric_new)),
                waterOld: String(toNumber(data.water_new)),
              }
            : current
        )
        setPreviousMetersLocked(true)
        return
      }

      setForm((current) =>
        current.roomId === roomId
          ? { ...current, electricOld: "0", waterOld: "0" }
          : current
      )
      setPreviousMetersLocked(false)
    } catch (error) {
      if (requestId !== previousMeterRequest.current) return
      console.log("Không lấy được chỉ số kỳ trước:", error)
      setPreviousMetersLocked(false)
      setFormError("Không lấy được chỉ số kỳ trước. Bạn vẫn có thể nhập số cũ.")
    } finally {
      if (requestId === previousMeterRequest.current) {
        setLoadingPreviousMeters(false)
      }
    }
  }

  function handleRoomChange(roomId: string) {
    const room = rentedRooms.find((item) => item.id === roomId)
    const requestId = ++previousMeterRequest.current
    setPreviousMetersLocked(false)
    setFormError(null)
    setForm((current) => ({
      ...current,
      roomId,
      roomPrice: room ? String(room.price) : "",
      electricOld: "",
      waterOld: "",
    }))
    void loadPreviousMeters(roomId, requestId)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const month = Number(form.month)
    const year = Number(form.year)
    const electricOld = Number(form.electricOld)
    const electricNew = Number(form.electricNew)
    const waterOld = Number(form.waterOld)
    const waterNew = Number(form.waterNew)
    const roomPrice = parseMoneyInput(String(form.roomPrice))

    if (!form.roomId) {
      setFormError("Vui lòng chọn phòng đang thuê.")
      return
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      setFormError("Tháng phải từ 1 đến 12.")
      return
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setFormError("Năm không hợp lệ.")
      return
    }
    if (
      !Number.isFinite(electricOld) ||
      !Number.isFinite(electricNew) ||
      electricOld < 0 ||
      electricNew < electricOld
    ) {
      setFormError("Số điện mới phải lớn hơn hoặc bằng số điện cũ.")
      return
    }
    if (
      !Number.isFinite(waterOld) ||
      !Number.isFinite(waterNew) ||
      waterOld < 0 ||
      waterNew < waterOld
    ) {
      setFormError("Số nước mới phải lớn hơn hoặc bằng số nước cũ.")
      return
    }
    if (!Number.isFinite(roomPrice) || roomPrice < 0) {
      setFormError("Không lấy được tiền phòng. Hãy chọn lại phòng.")
      return
    }

    setSubmitting(true)

    try {
      const supabase = createSupabaseClient()
      const { error } = await supabase.from("bills").insert({
        room_id: form.roomId,
        month,
        year,
        electric_old: electricOld,
        electric_new: electricNew,
        water_old: waterOld,
        water_new: waterNew,
        room_price: Math.round(roomPrice),
        status: "chưa thanh toán",
      })

      if (error) {
        if (isDuplicateBillMonth(error)) {
          console.log(
            `Không tạo được hóa đơn: ${describeSupabaseError(error)}`
          )
          setFormError(DUPLICATE_BILL_MESSAGE)
          return
        }
        console.error(`Không tạo được hóa đơn: ${describeSupabaseError(error)}`)
        setFormError(billErrorMessage(error))
        return
      }

      setOpen(false)
      setForm(emptyForm())
      await loadBills()
    } catch (error) {
      const duplicate =
        typeof error === "object" &&
        error !== null &&
        isDuplicateBillMonth(error as SupabaseErrorLike)
      if (duplicate) {
        console.log("Không tạo được hóa đơn:", error)
        setFormError(DUPLICATE_BILL_MESSAGE)
        return
      }
      console.error("Không tạo được hóa đơn:", error)
      setFormError(
        error instanceof Error
          ? error.message
          : "Không tạo được hóa đơn. Vui lòng thử lại."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkPaid(billId: string) {
    setPayingId(billId)
    setListError(null)

    try {
      const supabase = createSupabaseClient()
      const { error } = await supabase
        .from("bills")
        .update({ status: "đã thanh toán" })
        .eq("id", billId)

      if (error) {
        console.error(`Không thu được tiền: ${describeSupabaseError(error)}`)
        setListError(billErrorMessage(error))
        return
      }

      setBills((current) =>
        current.map((bill) =>
          bill.id === billId ? { ...bill, status: "đã thanh toán" } : bill
        )
      )
    } catch (error) {
      console.error("Không thu được tiền:", error)
      setListError(
        error instanceof Error
          ? error.message
          : "Không cập nhật được trạng thái thanh toán."
      )
    } finally {
      setPayingId(null)
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    setEditError(null)

    const invalid = meterValues(editForm)
    if (invalid) {
      setEditError(invalid)
      return
    }

    setSavingEdit(true)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("bills")
        .update({
          electric_old: Number(editForm.electricOld),
          electric_new: Number(editForm.electricNew),
          water_old: Number(editForm.waterOld),
          water_new: Number(editForm.waterNew),
        })
        .eq("id", editing.id)
        .select("id")

      if (error) {
        console.log(`Không sửa được hóa đơn: ${describeSupabaseError(error)}`)
        setEditError(billErrorMessage(error))
        return
      }

      if (!data?.length) {
        setEditError(
          "Không sửa được hóa đơn. Hãy kiểm tra quyền ghi của bảng bills."
        )
        return
      }

      setEditing(null)
      await loadBills()
    } catch (error) {
      console.error("Không sửa được hóa đơn:", error)
      setEditError(
        error instanceof Error
          ? error.message
          : "Không sửa được hóa đơn. Vui lòng thử lại."
      )
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("bills")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id")

      if (error) {
        console.log(`Không xóa được hóa đơn: ${describeSupabaseError(error)}`)
        setDeleteError(billErrorMessage(error))
        return
      }

      if (!data?.length) {
        setDeleteError(
          "Không xóa được hóa đơn. Hãy kiểm tra quyền ghi của bảng bills."
        )
        return
      }

      setDeleteTarget(null)
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id))
      await loadBills()
    } catch (error) {
      console.error("Không xóa được hóa đơn:", error)
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Không xóa được hóa đơn. Vui lòng thử lại."
      )
    } finally {
      setDeleting(false)
    }
  }

  const visibleBillIds = bills.map((bill) => bill.id)
  const visibleBillKey = visibleBillIds.join("|")

  useEffect(() => {
    const visible = new Set(visibleBillKey.split("|").filter(Boolean))
    setSelectedIds((current) => {
      const next = current.filter((id) => visible.has(id))
      return next.length === current.length ? current : next
    })
  }, [visibleBillKey])

  const allBillsSelected =
    visibleBillIds.length > 0 &&
    visibleBillIds.every((id) => selectedIds.includes(id))
  const someBillsSelected = visibleBillIds.some((id) => selectedIds.includes(id))

  function toggleBill(id: string) {
    setListSuccess(null)
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function toggleAllBills() {
    setListSuccess(null)
    setSelectedIds((current) => {
      if (allBillsSelected) {
        return current.filter((id) => !visibleBillIds.includes(id))
      }
      return [...new Set([...current, ...visibleBillIds])]
    })
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    setBulkDeleting(true)
    setBulkError(null)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("bills")
        .delete()
        .in("id", selectedIds)
        .select("id")

      if (error) {
        console.log(`Không xóa được hóa đơn: ${describeSupabaseError(error)}`)
        setBulkError(billErrorMessage(error))
        return
      }

      if (!data?.length) {
        setBulkError(
          "Không xóa được hóa đơn. Hãy kiểm tra quyền ghi của bảng bills."
        )
        return
      }

      setListSuccess(`Đã xóa ${data.length} dữ liệu.`)
      setSelectedIds([])
      setBulkOpen(false)
      await loadBills()
    } catch (error) {
      console.log("Không xóa được hóa đơn:", error)
      setBulkError(
        error instanceof Error
          ? error.message
          : "Không xóa được hóa đơn. Vui lòng thử lại."
      )
    } finally {
      setBulkDeleting(false)
    }
  }

  async function shareBill(billId: string) {
    const link = `${window.location.origin}/pay/${billId}`
    try {
      await navigator.clipboard.writeText(link)
      setShareToast("Đã copy link hóa đơn để gửi cho khách!")
    } catch {
      setShareToast("Không copy được link. Hãy thử lại.")
    }
    window.setTimeout(() => setShareToast(null), 3000)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {shareToast ? (
        <p
          role="status"
          className="fixed top-4 left-1/2 z-50 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-border bg-background px-4 py-3 text-sm shadow-lg"
        >
          {shareToast}
        </p>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tính tiền</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hóa đơn điện, nước và tiền phòng theo từng tháng.
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
          <Button type="button" onClick={openCreate}>
            <Plus />
            Chốt điện nước
          </Button>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-lg">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Chốt điện nước</DialogTitle>
                <DialogDescription>
                  Tổng tiền do cơ sở dữ liệu tính khi lưu. Điện 4.000đ/chữ, nước
                  25.000đ/khối, rác và mạng 100.000đ.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="bill-room">Chọn phòng</Label>
                <Select
                  value={form.roomId}
                  onValueChange={handleRoomChange}
                  disabled={loadingRooms || rentedRooms.length === 0}
                >
                  <SelectTrigger id="bill-room" className="w-full">
                    <SelectValue
                      placeholder={
                        loadingRooms
                          ? "Đang tải phòng đang thuê..."
                          : "Chọn phòng đang thuê"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="z-[70]" position="popper">
                    {rentedRooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.room_number} · Tầng {room.floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!loadingRooms && rentedRooms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Không có phòng đang thuê.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bill-room-price">Tiền phòng</Label>
                <Input
                  id="bill-room-price"
                  type="text"
                  inputMode="numeric"
                  value={form.roomPrice ? formatMoneyInput(form.roomPrice) : ""}
                  readOnly
                  placeholder="Chọn phòng để lấy giá thuê"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bill-month">Tháng</Label>
                  <Input
                    id="bill-month"
                    type="number"
                    min={1}
                    max={12}
                    step={1}
                    value={form.month}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        month: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bill-year">Năm</Label>
                  <Input
                    id="bill-year"
                    type="number"
                    min={2000}
                    max={2100}
                    step={1}
                    value={form.year}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        year: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bill-electric-old">Số điện cũ</Label>
                  <Input
                    id="bill-electric-old"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.electricOld}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        electricOld: event.target.value,
                      }))
                    }
                    readOnly={previousMetersLocked}
                    className={previousMetersLocked ? "bg-muted" : undefined}
                    placeholder={
                      loadingPreviousMeters ? "Đang lấy chỉ số kỳ trước..." : undefined
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bill-electric-new">Số điện mới</Label>
                  <Input
                    id="bill-electric-new"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.electricNew}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        electricNew: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bill-water-old">Số nước cũ</Label>
                  <Input
                    id="bill-water-old"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.waterOld}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        waterOld: event.target.value,
                      }))
                    }
                    readOnly={previousMetersLocked}
                    className={previousMetersLocked ? "bg-muted" : undefined}
                    placeholder={
                      loadingPreviousMeters ? "Đang lấy chỉ số kỳ trước..." : undefined
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bill-water-new">Số nước mới</Label>
                  <Input
                    id="bill-water-new"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.waterNew}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        waterNew: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              {form.roomId && !loadingPreviousMeters ? (
                <p className="text-sm text-muted-foreground">
                  {previousMetersLocked
                    ? "Số điện cũ và số nước cũ lấy từ chỉ số mới của hóa đơn gần nhất."
                    : "Phòng này chưa có hóa đơn. Hãy nhập mốc điện, nước ban đầu."}
                </p>
              ) : null}

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
                  disabled={
                    submitting ||
                    loadingRooms ||
                    loadingPreviousMeters ||
                    rentedRooms.length === 0
                  }
                >
                  {submitting ? "Đang lưu..." : "Lưu hóa đơn"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={editing !== null}
          onOpenChange={(next) => {
            if (savingEdit) return
            if (!next) {
              setEditing(null)
              setEditError(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <form className="grid gap-4" onSubmit={handleEditSubmit}>
              <DialogHeader>
                <DialogTitle>Sửa chỉ số điện nước</DialogTitle>
                <DialogDescription>
                  {editing
                    ? `Phòng ${editing.roomNumber}, tháng ${editing.month}/${editing.year}. Tổng tiền sẽ được tính lại khi lưu.`
                    : "Chỉ sửa số điện và số nước."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="edit-room-price">Tiền phòng</Label>
                <Input
                  id="edit-room-price"
                  type="text"
                  inputMode="numeric"
                  value={editing ? formatMoneyInput(editing.roomPrice) : ""}
                  readOnly
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="edit-electric-old">Số điện cũ</Label>
                  <Input
                    id="edit-electric-old"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.electricOld}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        electricOld: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-electric-new">Số điện mới</Label>
                  <Input
                    id="edit-electric-new"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.electricNew}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        electricNew: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="edit-water-old">Số nước cũ</Label>
                  <Input
                    id="edit-water-old"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.waterOld}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        waterOld: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-water-new">Số nước mới</Label>
                  <Input
                    id="edit-water-new"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.waterNew}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        waterNew: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              {editError ? (
                <p className="text-sm text-destructive" role="alert">
                  {editError}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingEdit}
                  onClick={() => {
                    setEditing(null)
                    setEditError(null)
                  }}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? "Đang lưu..." : "Lưu thay đổi"}
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
              <DialogTitle>Xóa hóa đơn</DialogTitle>
              <DialogDescription>
                Xóa hóa đơn phòng {deleteTarget?.roomNumber} tháng{" "}
                {deleteTarget?.month}/{deleteTarget?.year}? Thao tác này không
                hoàn tác được.
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
                {deleting ? "Đang xóa..." : "Xóa hóa đơn"}
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
              <DialogTitle>Xóa hóa đơn đã chọn</DialogTitle>
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
        <Table className="max-md:table-fixed max-md:text-xs">
          <TableHeader>
            <TableRow>
              {isAdmin ? (
                <TableHead className="hidden w-10 md:table-cell">
                  <Checkbox
                    checked={allBillsSelected}
                    indeterminate={someBillsSelected && !allBillsSelected}
                    disabled={bills.length === 0}
                    onChange={toggleAllBills}
                    aria-label="Chọn tất cả hóa đơn đang hiển thị"
                  />
                </TableHead>
              ) : null}
              <TableHead className="hidden md:table-cell">Tháng/Năm</TableHead>
              <TableHead className="w-[22%] md:w-auto">Số phòng</TableHead>
              <TableHead className="hidden md:table-cell">Tiền phòng</TableHead>
              <TableHead className="hidden md:table-cell">Số điện</TableHead>
              <TableHead className="hidden md:table-cell">Số nước</TableHead>
              <TableHead className="w-[32%] md:w-auto">Tổng tiền</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-[5.5rem] text-right md:w-auto">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-muted-foreground md:hidden">
                  Đang tải danh sách hóa đơn...
                </TableCell>
                <TableCell
                  colSpan={isAdmin ? 9 : 8}
                  className="hidden h-24 text-muted-foreground md:table-cell"
                >
                  Đang tải danh sách hóa đơn...
                </TableCell>
              </TableRow>
            ) : bills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-muted-foreground md:hidden">
                  Chưa có hóa đơn. Hãy chốt điện nước.
                </TableCell>
                <TableCell
                  colSpan={isAdmin ? 9 : 8}
                  className="hidden h-24 text-muted-foreground md:table-cell"
                >
                  Chưa có hóa đơn. Hãy chốt điện nước.
                </TableCell>
              </TableRow>
            ) : (
              bills.map((bill) => (
                <TableRow key={bill.id}>
                  {isAdmin ? (
                    <TableCell className="hidden md:table-cell">
                      <Checkbox
                        checked={selectedIds.includes(bill.id)}
                        onChange={() => toggleBill(bill.id)}
                        aria-label={`Chọn hóa đơn phòng ${bill.roomNumber} tháng ${bill.month}/${bill.year}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden font-medium md:table-cell">
                    {bill.month}/{bill.year}
                  </TableCell>
                  <TableCell>{bill.roomNumber}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatMoney(bill.roomPrice)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatMeter(bill.electricOld, bill.electricNew)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatMeter(bill.waterOld, bill.waterNew)}
                  </TableCell>
                  <TableCell>{formatMoney(bill.totalAmount)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <Badge className={`${statusClassName(bill.status)} max-md:px-1 max-md:whitespace-normal`}>
                      {statusLabel(bill.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-md:px-0.5">
                    <div className="flex flex-wrap items-center justify-end gap-0 md:flex-nowrap md:gap-1">
                      {bill.status === "chưa thanh toán" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="max-md:size-6 max-md:px-0"
                          disabled={payingId === bill.id}
                          aria-label={
                            payingId === bill.id ? "Đang cập nhật" : "Đã thu tiền"
                          }
                          onClick={() => void handleMarkPaid(bill.id)}
                        >
                          <Check />
                          <span className="hidden md:inline">
                            {payingId === bill.id ? "Đang cập nhật..." : "Đã thu tiền"}
                          </span>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-primary/10 hover:text-primary max-md:size-6"
                        aria-label={`Chia sẻ hóa đơn phòng ${bill.roomNumber} tháng ${bill.month}/${bill.year}`}
                        onClick={() => void shareBill(bill.id)}
                      >
                        <Link2 />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-primary/10 hover:text-primary max-md:size-6"
                        aria-label={`Sửa hóa đơn phòng ${bill.roomNumber} tháng ${bill.month}/${bill.year}`}
                        onClick={() => openEdit(bill)}
                      >
                        <Pencil />
                      </Button>
                      {isAdmin ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive max-md:size-6"
                          aria-label={`Xóa hóa đơn phòng ${bill.roomNumber} tháng ${bill.month}/${bill.year}`}
                          onClick={() => {
                            setDeleteError(null)
                            setDeleteTarget(bill)
                          }}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
