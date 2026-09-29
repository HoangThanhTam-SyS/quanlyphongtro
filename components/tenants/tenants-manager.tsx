"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, LogOut, Pencil, Plus, Search, Trash2 } from "lucide-react"

import { useUserRole } from "@/hooks/use-user-role"
import { formatMoneyInput, parseMoneyInput } from "@/lib/money-input"

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
import { createSupabaseClient } from "@/utils/supabase/client"

type VacantRoom = {
  id: string
  room_number: string
  floor: number
}

const TENANT_STATUSES = ["đang ở", "đã rời đi"] as const

type TenantStatus = (typeof TENANT_STATUSES)[number]

type TenantFilter = TenantStatus | "tất cả"

type TenantRoom = {
  id: string
  room_number: string
  price: number
}

type Tenant = {
  id: string
  roomId: string
  name: string
  phone: string
  cccd: string
  rooms: TenantRoom | null
  roomNumber: string
  moveInDate: string
  moveOutDate: string | null
  deposit: number
  status: string
}

type TenantEditForm = {
  name: string
  phone: string
  cccd: string
}

type TenantForm = {
  name: string
  phone: string
  cccd: string
  moveInDate: string
  deposit: string
  roomId: string
}

type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

function todayInputValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

function emptyForm(): TenantForm {
  return {
    name: "",
    phone: "",
    cccd: "",
    moveInDate: todayInputValue(),
    deposit: "",
    roomId: "",
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

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat("vi-VN").format(new Date(year, month - 1, day))
}

function formatMoveOutDate(status: string, value: string | null) {
  if (status === "đang ở" || !value) return "-"
  const [year, month, day] = value.slice(0, 10).split("-")
  if (!year || !month || !day) return "-"
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`
}

function joinedRoom(
  rooms: TenantRoom | TenantRoom[] | null | undefined
): TenantRoom | null {
  const room = Array.isArray(rooms) ? rooms[0] : rooms
  if (!room?.id || !room.room_number) return null
  return {
    id: room.id,
    room_number: room.room_number,
    price: toNumber(room.price),
  }
}

function describeSupabaseError(error: SupabaseErrorLike) {
  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" — ")
}

function isTenantStatus(value: string): value is TenantStatus {
  return (TENANT_STATUSES as readonly string[]).includes(value)
}

function tenantStatusLabel(status: string) {
  if (status === "đang ở") return "Đang ở"
  if (status === "đã rời đi") return "Đã rời đi"
  return status
}

function tenantStatusClassName(status: string) {
  if (status === "đang ở") {
    return "bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-200"
  }
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
}

function compareTenants(a: Tenant, b: Tenant) {
  const rank = (status: string) => (status === "đang ở" ? 0 : 1)
  const byStatus = rank(a.status) - rank(b.status)
  if (byStatus !== 0) return byStatus
  return b.moveInDate.localeCompare(a.moveInDate)
}

function tenantErrorMessage(error: SupabaseErrorLike) {
  if (
    error.code === "42501" ||
    error.message?.toLowerCase().includes("row-level security")
  ) {
    return "Supabase đang chặn vì bảng tenants hoặc rooms bật Row Level Security mà chưa có chính sách cho phép. Hãy chạy đoạn tenants_admin_all ở cuối file database.sql, rồi thử lại."
  }
  return error.message || "Không lưu được khách thuê. Vui lòng thử lại."
}

function isActiveTenant(status: string | null | undefined) {
  return status?.toLowerCase() === "đang ở"
}

const UNPAID_TENANT_DELETE_MESSAGE =
  "Thao tác thất bại! Khách đang ở vẫn còn hóa đơn chưa thanh toán."

const UNPAID_BILL_STATUSES = ["chưa thanh toán", "Chưa thanh toán"] as const

export function TenantsManager() {
  const { isAdmin } = useUserRole()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [vacantRooms, setVacantRooms] = useState<VacantRoom[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<TenantForm>(emptyForm)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [editForm, setEditForm] = useState<TenantEditForm>({
    name: "",
    phone: "",
    cccd: "",
  })
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [checkoutTarget, setCheckoutTarget] = useState<Tenant | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TenantFilter>("tất cả")
  const [cccdQuery, setCccdQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [listSuccess, setListSuccess] = useState<string | null>(null)

  const loadTenants = useCallback(async () => {
    setIsLoading(true)
    setListError(null)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("tenants")
        .select("*, rooms(id, room_number, price)")
        .order("move_in_date", { ascending: false })

      if (error) {
        console.error(`Không tải được khách thuê: ${describeSupabaseError(error)}`)
        setListError("Không tải được danh sách khách thuê. Vui lòng thử lại.")
        setTenants([])
        return
      }

      if (
        (data ?? []).length > 0 &&
        (data ?? []).every((tenant) => tenant.status == null)
      ) {
        setListError(
          "Bảng tenants chưa có cột status. Hãy chạy file migrations/add_tenant_status.sql trong Supabase SQL Editor, rồi tải lại trang."
        )
        setTenants([])
        return
      }

      setTenants(
        (data ?? []).map((tenant) => {
          const rooms = joinedRoom(tenant.rooms)
          return {
            id: tenant.id,
            roomId: tenant.room_id,
            name: tenant.name,
            phone: tenant.phone,
            cccd: tenant.cccd,
            rooms,
            roomNumber: rooms?.room_number ?? "—",
            moveInDate: tenant.move_in_date,
            moveOutDate:
              typeof tenant.move_out_date === "string" ? tenant.move_out_date : null,
            deposit: toNumber(tenant.deposit),
            status:
              typeof tenant.status === "string" && tenant.status
                ? tenant.status
                : "đang ở",
          }
        })
      )
    } catch (error) {
      console.error("Không tải được khách thuê:", error)
      setListError(
        error instanceof Error
          ? error.message
          : "Không tải được danh sách khách thuê. Vui lòng thử lại."
      )
      setTenants([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadVacantRooms = useCallback(async () => {
    setLoadingRooms(true)
    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_number, floor")
        .eq("status", "trống")
        .order("floor", { ascending: true })
        .order("room_number", { ascending: true })

      if (error) {
        console.error(
          `Không tải được phòng trống: ${describeSupabaseError(error)}`
        )
        setVacantRooms([])
        setFormError("Không tải được danh sách phòng trống.")
        return
      }

      setVacantRooms(
        (data ?? []).map((room) => ({
          id: room.id,
          room_number: room.room_number,
          floor: toNumber(room.floor),
        }))
      )
    } catch (error) {
      console.error("Không tải được phòng trống:", error)
      setVacantRooms([])
      setFormError(
        error instanceof Error
          ? error.message
          : "Không tải được danh sách phòng trống."
      )
    } finally {
      setLoadingRooms(false)
    }
  }, [])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

  function openCreate() {
    setForm(emptyForm())
    setFormError(null)
    setOpen(true)
    void loadVacantRooms()
  }

  function openEdit(tenant: Tenant) {
    setEditing(tenant)
    setEditForm({
      name: tenant.name,
      phone: tenant.phone,
      cccd: tenant.cccd,
    })
    setEditError(null)
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return
    setOpen(next)
    if (next) {
      setForm(emptyForm())
      setFormError(null)
      void loadVacantRooms()
      return
    }
    setForm(emptyForm())
    setFormError(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const name = form.name.trim()
    const phone = form.phone.trim()
    const cccd = form.cccd.trim()
    const deposit = parseMoneyInput(form.deposit)

    if (!name) {
      setFormError("Vui lòng nhập tên khách.")
      return
    }
    if (!phone) {
      setFormError("Vui lòng nhập số điện thoại.")
      return
    }
    if (!cccd) {
      setFormError("Vui lòng nhập số CCCD.")
      return
    }
    if (!form.moveInDate) {
      setFormError("Vui lòng chọn ngày dọn vào.")
      return
    }
    if (!Number.isFinite(deposit) || deposit < 0) {
      setFormError("Tiền cọc phải là số không âm.")
      return
    }
    if (!form.roomId) {
      setFormError("Vui lòng chọn phòng trống.")
      return
    }

    setSubmitting(true)

    try {
      const supabase = createSupabaseClient()
      const { data: inserted, error: insertError } = await supabase
        .from("tenants")
        .insert({
          room_id: form.roomId,
          name,
          phone,
          cccd,
          move_in_date: form.moveInDate,
          deposit: Math.round(deposit),
          status: "đang ở",
        })
        .select("id")
        .single()

      if (insertError) {
        console.error(
          `Không thêm được khách thuê: ${describeSupabaseError(insertError)}`
        )
        setFormError(tenantErrorMessage(insertError))
        return
      }

      const { error: updateError } = await supabase
        .from("rooms")
        .update({ status: "đang thuê" })
        .eq("id", form.roomId)

      if (updateError) {
        console.error(
          `Không cập nhật được trạng thái phòng: ${describeSupabaseError(updateError)}`
        )
        if (inserted?.id) {
          const { error: rollbackError } = await supabase
            .from("tenants")
            .delete()
            .eq("id", inserted.id)
          if (rollbackError) {
            console.error(
              `Không hoàn tác được khách thuê: ${describeSupabaseError(rollbackError)}`
            )
          }
        }
        setFormError(
          "Đã thêm khách nhưng không đổi được trạng thái phòng. Thao tác đã được hoàn tác, hãy thử lại."
        )
        return
      }

      setOpen(false)
      setForm(emptyForm())
      await loadTenants()
    } catch (error) {
      console.error("Không thêm được khách thuê:", error)
      setFormError(
        error instanceof Error
          ? error.message
          : "Không thêm được khách thuê. Vui lòng thử lại."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    setEditError(null)

    const name = editForm.name.trim()
    const phone = editForm.phone.trim()
    const cccd = editForm.cccd.trim()

    if (!name) {
      setEditError("Vui lòng nhập tên khách.")
      return
    }
    if (!phone) {
      setEditError("Vui lòng nhập số điện thoại.")
      return
    }
    if (!cccd) {
      setEditError("Vui lòng nhập số CCCD.")
      return
    }

    setSavingEdit(true)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("tenants")
        .update({ name, phone, cccd })
        .eq("id", editing.id)
        .select("id")

      if (error) {
        console.log(
          `Không sửa được khách thuê: ${describeSupabaseError(error)}`
        )
        setEditError(tenantErrorMessage(error))
        return
      }

      if (!data?.length) {
        setEditError(
          "Không sửa được khách thuê. Hãy kiểm tra quyền ghi của bảng tenants."
        )
        return
      }

      setEditing(null)
      await loadTenants()
    } catch (error) {
      console.error("Không sửa được khách thuê:", error)
      setEditError(
        error instanceof Error
          ? error.message
          : "Không sửa được khách thuê. Vui lòng thử lại."
      )
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)

    const activeRoomIds = isActiveTenant(deleteTarget.status)
      ? [...new Set([deleteTarget.roomId].filter(Boolean))]
      : []

    try {
      const supabase = createSupabaseClient()

      if (isActiveTenant(deleteTarget.status) && activeRoomIds.length === 0) {
        setDeleteError("Không xác định được phòng của khách thuê nên không thể xóa.")
        return
      }

      if (activeRoomIds.length > 0) {
        const { data: unpaidBills, error: checkError } = await supabase
          .from("bills")
          .select("id, room_id")
          .in("room_id", activeRoomIds)
          .in("status", [...UNPAID_BILL_STATUSES])

        if (checkError) {
          console.log(
            `Không kiểm tra được hóa đơn: ${describeSupabaseError(checkError)}`
          )
          setDeleteError(tenantErrorMessage(checkError))
          return
        }

        if (unpaidBills && unpaidBills.length > 0) {
          setDeleteError(UNPAID_TENANT_DELETE_MESSAGE)
          return
        }
      }

      const { data, error } = await supabase
        .from("tenants")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id")

      if (error) {
        console.log(
          `Không xóa được khách thuê: ${describeSupabaseError(error)}`
        )
        setDeleteError(tenantErrorMessage(error))
        return
      }

      if (!data?.length) {
        setDeleteError(
          "Không xóa được khách thuê. Hãy kiểm tra quyền ghi của bảng tenants."
        )
        return
      }

      if (!isActiveTenant(deleteTarget.status)) {
        setDeleteTarget(null)
        setSelectedIds((current) =>
          current.filter((id) => id !== deleteTarget.id)
        )
        await loadTenants()
        return
      }

      const { data: roomRows, error: roomError } = await supabase
        .from("rooms")
        .update({ status: "trống" })
        .eq("id", deleteTarget.roomId)
        .select("id")

      if (roomError || !roomRows?.length) {
        if (roomError) {
          console.error(
            `Không cập nhật được trạng thái phòng: ${describeSupabaseError(roomError)}`
          )
        }
        setDeleteError(
          "Đã xóa khách thuê nhưng không đổi được phòng về trạng thái Trống. Hãy kiểm tra lại phòng."
        )
        await loadTenants()
        return
      }

      setDeleteTarget(null)
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id))
      await loadTenants()
    } catch (error) {
      console.error("Không xóa được khách thuê:", error)
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Không xóa được khách thuê. Vui lòng thử lại."
      )
    } finally {
      setDeleting(false)
    }
  }

  async function handleCheckout() {
    if (!checkoutTarget) return
    setCheckingOut(true)
    setCheckoutError(null)

    try {
      const supabase = createSupabaseClient()
      const { data: unpaidBills, error: billsError } = await supabase
        .from("bills")
        .select("id")
        .eq("room_id", checkoutTarget.roomId)
        .eq("status", "chưa thanh toán")

      if (billsError) {
        console.log(
          `Không kiểm tra được hóa đơn: ${describeSupabaseError(billsError)}`
        )
        setCheckoutError(tenantErrorMessage(billsError))
        return
      }

      if ((unpaidBills ?? []).length > 0) {
        setCheckoutError(
          "Thao tác thất bại! Căn phòng này vẫn còn hóa đơn chưa thanh toán. Vui lòng thu tiền trước khi trả phòng."
        )
        return
      }

      const { data, error } = await supabase
        .from("tenants")
        .update({
          status: "đã rời đi",
          move_out_date: todayInputValue(),
        })
        .eq("id", checkoutTarget.id)
        .select("id")

      if (error) {
        console.log(
          `Không trả phòng được: ${describeSupabaseError(error)}`
        )
        setCheckoutError(tenantErrorMessage(error))
        return
      }

      if (!data?.length) {
        setCheckoutError(
          "Không cập nhật được trạng thái khách. Hãy kiểm tra quyền ghi của bảng tenants."
        )
        return
      }

      const { data: roomRows, error: roomError } = await supabase
        .from("rooms")
        .update({ status: "trống" })
        .eq("id", checkoutTarget.roomId)
        .select("id")

      if (roomError || !roomRows?.length) {
        if (roomError) {
          console.log(
            `Không chuyển phòng về trống: ${describeSupabaseError(roomError)}`
          )
        }
        const { error: revertError } = await supabase
          .from("tenants")
          .update({ status: "đang ở", move_out_date: null })
          .eq("id", checkoutTarget.id)
        if (revertError) {
          console.log(
            `Không hoàn tác được trạng thái khách: ${describeSupabaseError(revertError)}`
          )
        }
        setCheckoutError(
          "Không chuyển được phòng về trạng thái Trống. Thao tác đã được hoàn tác."
        )
        return
      }

      setCheckoutTarget(null)
      await loadTenants()
    } catch (error) {
      console.log("Không trả phòng được:", error)
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Không trả phòng được. Vui lòng thử lại."
      )
    } finally {
      setCheckingOut(false)
    }
  }

  const cccdNeedle = cccdQuery.trim()
  const visibleTenants = tenants
    .filter((tenant) =>
      statusFilter === "tất cả" ? true : tenant.status === statusFilter
    )
    .filter((tenant) =>
      cccdNeedle === "" ? true : tenant.cccd.includes(cccdNeedle)
    )
    .sort(compareTenants)

  const visibleTenantIds = visibleTenants.map((tenant) => tenant.id)
  const visibleTenantKey = visibleTenantIds.join("|")

  useEffect(() => {
    const visible = new Set(visibleTenantKey.split("|").filter(Boolean))
    setSelectedIds((current) => {
      const next = current.filter((id) => visible.has(id))
      return next.length === current.length ? current : next
    })
  }, [visibleTenantKey])

  const allTenantsSelected =
    visibleTenantIds.length > 0 &&
    visibleTenantIds.every((id) => selectedIds.includes(id))
  const someTenantsSelected = visibleTenantIds.some((id) =>
    selectedIds.includes(id)
  )

  function toggleTenant(id: string) {
    setListSuccess(null)
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function toggleAllTenants() {
    setListSuccess(null)
    setSelectedIds((current) => {
      if (allTenantsSelected) {
        return current.filter((id) => !visibleTenantIds.includes(id))
      }
      return [...new Set([...current, ...visibleTenantIds])]
    })
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    setBulkDeleting(true)
    setBulkError(null)

    const chosen = tenants.filter((tenant) => selectedIds.includes(tenant.id))
    const activeRoomIds = [
      ...new Set(
        chosen
          .filter((tenant) => isActiveTenant(tenant.status))
          .map((tenant) => tenant.roomId)
          .filter(Boolean)
      ),
    ]

    try {
      const supabase = createSupabaseClient()

      if (activeRoomIds.length > 0) {
        const { data: unpaidBills, error: checkError } = await supabase
          .from("bills")
          .select("id, room_id")
          .in("room_id", activeRoomIds)
          .in("status", [...UNPAID_BILL_STATUSES])

        if (checkError) {
          console.log(
            `Không kiểm tra được hóa đơn: ${describeSupabaseError(checkError)}`
          )
          setBulkError(tenantErrorMessage(checkError))
          return
        }

        if (unpaidBills && unpaidBills.length > 0) {
          setBulkError(UNPAID_TENANT_DELETE_MESSAGE)
          return
        }
      }

      if (activeRoomIds.length > 0) {
        const { data: roomRows, error: roomError } = await supabase
          .from("rooms")
          .update({ status: "trống" })
          .in("id", activeRoomIds)
          .select("id")

        if (roomError || roomRows?.length !== activeRoomIds.length) {
          if (roomError) {
            console.log(
              `Không chuyển phòng về trống: ${describeSupabaseError(roomError)}`
            )
          }
          setBulkError(
            "Không chuyển được phòng của khách đang ở về trạng thái Trống."
          )
          return
        }
      }

      const { data, error } = await supabase
        .from("tenants")
        .delete()
        .in("id", selectedIds)
        .select("id")

      if (error || !data?.length) {
        if (activeRoomIds.length > 0) {
          const { error: revertError } = await supabase
            .from("rooms")
            .update({ status: "đang thuê" })
            .in("id", activeRoomIds)
          if (revertError) {
            console.log(
              `Không hoàn tác được trạng thái phòng: ${describeSupabaseError(revertError)}`
            )
          }
        }
        if (error) {
          console.log(
            `Không xóa được khách thuê: ${describeSupabaseError(error)}`
          )
          setBulkError(tenantErrorMessage(error))
        } else {
          setBulkError(
            "Không xóa được khách thuê. Hãy kiểm tra quyền ghi của bảng tenants."
          )
        }
        return
      }

      setListSuccess(`Đã xóa ${data.length} dữ liệu.`)
      setSelectedIds([])
      setBulkOpen(false)
      await loadTenants()
    } catch (error) {
      console.log("Không xóa được khách thuê:", error)
      setBulkError(
        error instanceof Error
          ? error.message
          : "Không xóa được khách thuê. Vui lòng thử lại."
      )
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Khách thuê</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thông tin khách, phòng đang ở, căn cước và tiền cọc.
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
            Thêm khách thuê mới
          </Button>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-md">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Thêm khách thuê mới</DialogTitle>
                <DialogDescription>
                  Chọn phòng đang trống. Sau khi lưu, phòng sẽ chuyển sang Đang
                  thuê.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="tenant-name">Tên</Label>
                <Input
                  id="tenant-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="tenant-phone">SĐT</Label>
                  <Input
                    id="tenant-phone"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tenant-cccd">CCCD</Label>
                  <Input
                    id="tenant-cccd"
                    value={form.cccd}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cccd: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="tenant-move-in">Ngày dọn vào</Label>
                  <Input
                    id="tenant-move-in"
                    type="date"
                    value={form.moveInDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        moveInDate: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tenant-deposit">Tiền cọc (đồng)</Label>
                  <Input
                    id="tenant-deposit"
                    type="text"
                    inputMode="numeric"
                    value={form.deposit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        deposit: formatMoneyInput(event.target.value),
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tenant-room">Chọn phòng</Label>
                <Select
                  value={form.roomId}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, roomId: value }))
                  }
                  disabled={loadingRooms || vacantRooms.length === 0}
                >
                  <SelectTrigger id="tenant-room" className="w-full">
                    <SelectValue
                      placeholder={
                        loadingRooms ? "Đang tải phòng trống..." : "Chọn phòng trống"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="z-[70]" position="popper">
                    {vacantRooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.room_number} · Tầng {room.floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!loadingRooms && vacantRooms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Không có phòng trống. Hãy thêm phòng hoặc chuyển phòng về
                    trạng thái Trống.
                  </p>
                ) : null}
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
                  disabled={submitting || loadingRooms || vacantRooms.length === 0}
                >
                  {submitting ? "Đang lưu..." : "Lưu khách thuê"}
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
          <DialogContent className="sm:max-w-md">
            <form className="grid gap-4" onSubmit={handleEditSubmit}>
              <DialogHeader>
                <DialogTitle>Sửa khách thuê</DialogTitle>
                <DialogDescription>
                  {editing
                    ? `Cập nhật tên, số điện thoại và CCCD của ${editing.name}. Phòng đang ở giữ nguyên.`
                    : "Cập nhật tên, số điện thoại và CCCD. Phòng đang ở giữ nguyên."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Label htmlFor="edit-tenant-name">Tên</Label>
                <Input
                  id="edit-tenant-name"
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="edit-tenant-phone">SĐT</Label>
                  <Input
                    id="edit-tenant-phone"
                    value={editForm.phone}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-tenant-cccd">CCCD</Label>
                  <Input
                    id="edit-tenant-cccd"
                    value={editForm.cccd}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        cccd: event.target.value,
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
              <DialogTitle>Xóa khách thuê</DialogTitle>
              <DialogDescription>
                Xóa {deleteTarget?.name}? Phòng {deleteTarget?.roomNumber} sẽ
                chuyển về trạng thái Trống.
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
                {deleting ? "Đang xóa..." : "Xóa khách thuê"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={checkoutTarget !== null}
          onOpenChange={(next) => {
            if (checkingOut) return
            if (!next) {
              setCheckoutTarget(null)
              setCheckoutError(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Trả phòng</DialogTitle>
              <DialogDescription>
                Xác nhận khách {checkoutTarget?.name} trả phòng? Căn phòng sẽ
                được chuyển sang trạng thái trống.
              </DialogDescription>
            </DialogHeader>
            {checkoutError ? (
              <p className="text-sm text-destructive" role="alert">
                {checkoutError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={checkingOut}
                onClick={() => {
                  setCheckoutTarget(null)
                  setCheckoutError(null)
                }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={checkingOut}
                onClick={() => void handleCheckout()}
              >
                {checkingOut ? "Đang lưu..." : "Trả phòng"}
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
              <DialogTitle>Xóa khách thuê đã chọn</DialogTitle>
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

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={cccdQuery}
          onChange={(event) => setCccdQuery(event.target.value)}
          placeholder="Tìm kiếm theo CCCD..."
          aria-label="Tìm kiếm theo CCCD"
          className="pl-8"
          inputMode="numeric"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["tất cả", "Tất cả"],
            ["đang ở", "Đang ở"],
            ["đã rời đi", "Đã rời đi"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={statusFilter === value ? "default" : "outline"}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Table className="max-md:table-fixed">
          <TableHeader>
            <TableRow>
              {isAdmin ? (
                <TableHead className="hidden w-10 md:table-cell">
                  <Checkbox
                    checked={allTenantsSelected}
                    indeterminate={someTenantsSelected && !allTenantsSelected}
                    disabled={visibleTenants.length === 0}
                    onChange={toggleAllTenants}
                    aria-label="Chọn tất cả khách thuê đang hiển thị"
                  />
                </TableHead>
              ) : null}
              <TableHead className="w-[34%] md:w-auto">Tên khách</TableHead>
              <TableHead className="hidden md:table-cell">SĐT</TableHead>
              <TableHead className="hidden md:table-cell">CCCD</TableHead>
              <TableHead>Số phòng</TableHead>
              <TableHead className="hidden md:table-cell">Ngày dọn vào</TableHead>
              <TableHead className="hidden md:table-cell">Ngày rời đi</TableHead>
              <TableHead className="hidden md:table-cell">Tiền cọc</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-[4.5rem] text-right md:w-auto">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 md:hidden">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Đang tải danh sách khách thuê...
                  </div>
                </TableCell>
                <TableCell
                  colSpan={isAdmin ? 10 : 9}
                  className="hidden h-24 md:table-cell"
                >
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Đang tải danh sách khách thuê...
                  </div>
                </TableCell>
              </TableRow>
            ) : visibleTenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-muted-foreground md:hidden">
                  {listError
                    ? "Không tải được danh sách khách thuê."
                    : cccdNeedle
                      ? "Không có khách thuê khớp CCCD này."
                      : tenants.length === 0
                        ? "Chưa có khách thuê. Hãy thêm khách thuê mới."
                        : statusFilter === "đã rời đi"
                          ? "Chưa có khách đã rời đi."
                          : "Không có khách đang ở."}
                </TableCell>
                <TableCell
                  colSpan={isAdmin ? 10 : 9}
                  className="hidden h-24 text-muted-foreground md:table-cell"
                >
                  {listError
                    ? "Không tải được danh sách khách thuê."
                    : cccdNeedle
                      ? "Không có khách thuê khớp CCCD này."
                      : tenants.length === 0
                        ? "Chưa có khách thuê. Hãy thêm khách thuê mới."
                        : statusFilter === "đã rời đi"
                          ? "Chưa có khách đã rời đi."
                          : "Không có khách đang ở."}
                </TableCell>
              </TableRow>
            ) : (
              visibleTenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  {isAdmin ? (
                    <TableCell className="hidden md:table-cell">
                      <Checkbox
                        checked={selectedIds.includes(tenant.id)}
                        onChange={() => toggleTenant(tenant.id)}
                        aria-label={`Chọn khách ${tenant.name}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-0 truncate font-medium md:max-w-none">
                    {tenant.name}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{tenant.phone}</TableCell>
                  <TableCell className="hidden md:table-cell">{tenant.cccd}</TableCell>
                  <TableCell>{tenant.rooms?.room_number ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDate(tenant.moveInDate)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatMoveOutDate(tenant.status, tenant.moveOutDate)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatMoney(tenant.deposit)}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${tenantStatusClassName(tenant.status)} max-md:px-1`}>
                      {isTenantStatus(tenant.status)
                        ? tenantStatusLabel(tenant.status)
                        : tenant.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-0 md:flex-nowrap md:gap-1">
                      {tenant.status === "đang ở" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive max-md:size-6"
                          aria-label={`Trả phòng ${tenant.name}`}
                          onClick={() => {
                            setCheckoutError(null)
                            setCheckoutTarget(tenant)
                          }}
                        >
                          <LogOut />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-primary/10 hover:text-primary max-md:size-6"
                        aria-label={`Sửa khách ${tenant.name}`}
                        onClick={() => openEdit(tenant)}
                      >
                        <Pencil />
                      </Button>
                      {isAdmin ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive max-md:size-6"
                          aria-label={`Xóa khách ${tenant.name}`}
                          onClick={() => {
                            setDeleteError(null)
                            setDeleteTarget(tenant)
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
