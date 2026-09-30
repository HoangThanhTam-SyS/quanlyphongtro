"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertCircle,
  DollarSign,
  DoorOpen,
  Home,
  KeyRound,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createSupabaseClient } from "@/utils/supabase/client"

type UnpaidBill = {
  id: string
  roomNumber: string
  month: number
  year: number
  totalAmount: number
}

type DashboardStats = {
  totalRooms: number
  vacantRooms: number
  rentedRooms: number
  totalTenants: number
  monthlyRevenue: number
  unpaidAmount: number
  unpaidBills: UnpaidBill[]
}

type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
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

const dashboardCardClassName = "overflow-hidden gap-0 pt-0"
const dashboardCardHeaderClassName = "border-b bg-[#d3ddf3] pt-3 pb-3!"
const dashboardCardContentClassName = "bg-card pt-4"
const statCardClassName = `${dashboardCardClassName} pb-0`
const statCardHeaderClassName =
  "border-b bg-[#d3ddf3] px-3! pt-3! pb-2! md:px-6! md:pt-6! md:pb-4!"
const statCardContentClassName =
  "bg-card px-3! pt-2! pb-3! md:px-6! md:pt-4! md:pb-6!"

const statCards = [
  {
    key: "totalRooms" as const,
    label: "Tổng số phòng",
    icon: Home,
    money: false,
  },
  {
    key: "vacantRooms" as const,
    label: "Phòng trống",
    icon: DoorOpen,
    money: false,
  },
  {
    key: "rentedRooms" as const,
    label: "Đang thuê",
    icon: KeyRound,
    money: false,
  },
  {
    key: "totalTenants" as const,
    label: "Tổng khách thuê",
    icon: Users,
    money: false,
  },
  {
    key: "monthlyRevenue" as const,
    label: "Doanh thu tháng này",
    icon: DollarSign,
    money: true,
  },
  {
    key: "unpaidAmount" as const,
    label: "Tiền chưa thu",
    icon: AlertCircle,
    money: true,
  },
]

function StatSkeleton() {
  return (
    <Card className={statCardClassName}>
      <CardHeader className={statCardHeaderClassName}>
        <div className="h-3 w-20 animate-pulse rounded bg-white/70 md:h-4 md:w-24" />
      </CardHeader>
      <CardContent className={statCardContentClassName}>
        <div className="h-6 w-16 animate-pulse rounded bg-muted md:h-8 md:w-20" />
      </CardContent>
    </Card>
  )
}

export function DashboardOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createSupabaseClient()
      const [roomsResult, tenantsResult, billsResult] = await Promise.all([
        supabase.from("rooms").select("id, status"),
        supabase.from("tenants").select("id").eq("status", "đang ở"),
        supabase
          .from("bills")
          .select("id, month, year, total_amount, status, rooms(room_number)"),
      ])

      const queryError =
        roomsResult.error ?? tenantsResult.error ?? billsResult.error
      if (queryError) {
        console.error(
          `Không tải được tổng quan: ${describeSupabaseError(queryError)}`
        )
        setStats(null)
        setError("Không tải được dữ liệu tổng quan. Vui lòng thử lại.")
        return
      }

      const rooms = roomsResult.data ?? []
      const tenants = tenantsResult.data ?? []
      const bills = billsResult.data ?? []
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      const unpaidBills = bills
        .filter((bill) => bill.status === "chưa thanh toán")
        .map((bill) => ({
          id: bill.id,
          roomNumber: roomNumberFromJoin(bill.rooms),
          month: toNumber(bill.month),
          year: toNumber(bill.year),
          totalAmount: toNumber(bill.total_amount),
        }))
        .sort((a, b) => b.year - a.year || b.month - a.month)

      setStats({
        totalRooms: rooms.length,
        vacantRooms: rooms.filter((room) => room.status === "trống").length,
        rentedRooms: rooms.filter((room) => room.status === "đang thuê").length,
        totalTenants: tenants.length,
        monthlyRevenue: bills
          .filter(
            (bill) =>
              bill.status === "đã thanh toán" &&
              toNumber(bill.month) === month &&
              toNumber(bill.year) === year
          )
          .reduce((sum, bill) => sum + toNumber(bill.total_amount), 0),
        unpaidAmount: unpaidBills.reduce(
          (sum, bill) => sum + bill.totalAmount,
          0
        ),
        unpaidBills,
      })
    } catch (loadError) {
      console.error("Không tải được tổng quan:", loadError)
      setStats(null)
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không tải được dữ liệu tổng quan. Vui lòng thử lại."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Theo dõi tình trạng phòng, khách thuê và hóa đơn.
        </p>
      </div>

      {error ? (
        <Card className={dashboardCardClassName}>
          <CardHeader className={dashboardCardHeaderClassName}>
            <CardTitle className="text-slate-900">Không tải được dữ liệu</CardTitle>
            <CardDescription className="text-slate-700">{error}</CardDescription>
          </CardHeader>
          <CardContent className={dashboardCardContentClassName}>
            <Button type="button" variant="outline" onClick={() => void loadStats()}>
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading
          ? statCards.map((item) => <StatSkeleton key={item.key} />)
          : stats
            ? statCards.map((item) => {
                const Icon = item.icon
                const value = stats[item.key]
                return (
                  <Card key={item.key} className={statCardClassName}>
                    <CardHeader className={statCardHeaderClassName}>
                      <CardTitle className="text-base text-slate-900 md:text-sm">
                        {item.label}
                      </CardTitle>
                      <CardAction>
                        <span className="flex size-6 items-center justify-center rounded-lg bg-white/80 text-primary md:size-8">
                          <Icon className="h-4 w-4 md:h-5 md:w-5" />
                        </span>
                      </CardAction>
                    </CardHeader>
                    <CardContent className={statCardContentClassName}>
                      <p className="text-xl font-bold tracking-tight md:text-3xl">
                        {item.money ? formatMoney(value) : value}
                      </p>
                    </CardContent>
                  </Card>
                )
              })
            : null}
      </div>

      {error ? null : (
      <Card className={dashboardCardClassName}>
        <CardHeader className={dashboardCardHeaderClassName}>
          <CardTitle className="text-slate-900">Cần chú ý</CardTitle>
          <CardDescription className="text-slate-700">
            Hóa đơn chưa thanh toán cần đi thu.
          </CardDescription>
        </CardHeader>
        <CardContent className={dashboardCardContentClassName}>
          {loading ? (
            <div className="flex flex-col gap-3">
              <div className="h-10 animate-pulse rounded-lg bg-muted" />
              <div className="h-10 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : !stats || stats.unpaidBills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Không có hóa đơn nào chưa thanh toán.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.unpaidBills.map((bill) => (
                <li
                  key={bill.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">Phòng {bill.roomNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      Tháng {bill.month}/{bill.year}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium">
                    {formatMoney(bill.totalAmount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  )
}
