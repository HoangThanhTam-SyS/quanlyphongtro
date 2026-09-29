import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

import { getSupabaseAnonKey, getSupabaseUrl } from "@/utils/supabase/env"

const ELECTRIC_RATE_FALLBACK = 4000
const WATER_RATE_FALLBACK = 25000
const SERVICE_FEE_FALLBACK = 100000

type PayPageProps = {
  params: Promise<{ id: string }>
}

type RoomJoin = {
  room_number: string
  tenants: { name: string; status: string; move_in_date: string }[] | null
}

type BillRow = {
  id: string
  month: number
  year: number
  electric_old: number | string
  electric_new: number | string
  water_old: number | string
  water_new: number | string
  room_price: number | string
  total_amount: number | string
  status: string
  rooms: RoomJoin | RoomJoin[] | null
}

type SettingsRow = {
  electric_price: number | string
  water_price: number | string
  service_price: number | string
  bank_code?: string | null
  bank_account?: string | null
  bank_owner?: string | null
}

export async function generateMetadata({ params }: PayPageProps): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Hóa đơn ${id.slice(0, 8)}`,
  }
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0
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

function joinedRoom(rooms: BillRow["rooms"]) {
  if (!rooms) return null
  return Array.isArray(rooms) ? (rooms[0] ?? null) : rooms
}

function tenantName(room: RoomJoin | null) {
  const tenants = room?.tenants ?? []
  const staying = tenants.find((tenant) => tenant.status?.toLowerCase() === "đang ở")
  if (staying) return staying.name
  const latest = [...tenants].sort((a, b) =>
    b.move_in_date.localeCompare(a.move_in_date)
  )[0]
  return latest?.name ?? "Chưa có khách"
}

function vietQrUrl(input: {
  bankCode: string
  bankAccount: string
  bankOwner: string
  roomNumber: string
  month: number
  amount: number
}) {
  const addInfo = encodeURIComponent(`${input.roomNumber} thang ${input.month}`)
  const accountName = encodeURIComponent(input.bankOwner.trim())
  const bankCode = encodeURIComponent(input.bankCode.trim())
  const bankAccount = encodeURIComponent(input.bankAccount.trim())
  return `https://img.vietqr.io/image/${bankCode}-${bankAccount}-compact2.png?amount=${input.amount}&addInfo=${addInfo}&accountName=${accountName}`
}

export default async function PayPage({ params }: PayPageProps) {
  const { id } = await params
  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [{ data, error }, settingsResult, bankResult] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "id, month, year, electric_old, electric_new, water_old, water_new, room_price, total_amount, status, rooms(room_number, tenants(name, status, move_in_date))"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("electric_price, water_price, service_price")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("bank_code, bank_account, bank_owner")
      .eq("id", 1)
      .maybeSingle(),
  ])

  if (error || !data) {
    notFound()
  }

  const bill = data as BillRow
  const priceSettings = settingsResult.data as SettingsRow | null
  const bankSettings = bankResult.error ? null : (bankResult.data as SettingsRow | null)
  const settings = priceSettings
    ? { ...priceSettings, ...bankSettings }
    : bankSettings
  const electricRate = settings
    ? toNumber(settings.electric_price)
    : ELECTRIC_RATE_FALLBACK
  const waterRate = settings ? toNumber(settings.water_price) : WATER_RATE_FALLBACK
  const serviceFee = settings
    ? toNumber(settings.service_price)
    : SERVICE_FEE_FALLBACK
  const room = joinedRoom(bill.rooms)
  const roomNumber = room?.room_number ?? "—"
  const guest = tenantName(room)
  const roomPrice = toNumber(bill.room_price)
  const electricUse = toNumber(bill.electric_new) - toNumber(bill.electric_old)
  const waterUse = toNumber(bill.water_new) - toNumber(bill.water_old)
  const electricCost = Math.round(electricUse * electricRate)
  const waterCost = Math.round(waterUse * waterRate)
  const totalAmount = toNumber(bill.total_amount)
  const pricedService =
    electricCost + waterCost + roomPrice + serviceFee === totalAmount
      ? serviceFee
      : Math.max(0, totalAmount - roomPrice - electricCost - waterCost)
  const paid = bill.status === "đã thanh toán"
  const bankCode = settings?.bank_code?.trim() ?? ""
  const bankAccount = settings?.bank_account?.trim() ?? ""
  const bankOwner = settings?.bank_owner?.trim() ?? ""
  const qrUrl =
    bankCode && bankAccount && bankOwner
      ? vietQrUrl({
          bankCode,
          bankAccount,
          bankOwner,
          roomNumber,
          month: bill.month,
          amount: totalAmount,
        })
      : null

  return (
    <main className="min-h-svh bg-muted/40 px-4 py-6 text-foreground">
      <article className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <header className="text-center">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Biên lai thanh toán
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Phòng {roomNumber}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tháng {bill.month}/{bill.year}
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Khách thuê</dt>
            <dd className="font-medium">{guest}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trạng thái</dt>
            <dd className={paid ? "font-medium text-green-700" : "font-medium text-red-700"}>
              {paid ? "Đã thanh toán" : "Chưa thanh toán"}
            </dd>
          </div>
        </dl>

        <ul className="flex flex-col gap-3 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span>Tiền phòng</span>
            <span className="font-medium">{formatMoney(roomPrice)}</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>
              Điện ({electricUse} số)
            </span>
            <span className="font-medium">{formatMoney(electricCost)}</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Nước ({waterUse} khối)</span>
            <span className="font-medium">{formatMoney(waterCost)}</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Dịch vụ</span>
            <span className="font-medium">{formatMoney(pricedService)}</span>
          </li>
        </ul>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-medium">Tổng tiền</span>
          <span className="text-xl font-semibold">{formatMoney(totalAmount)}</span>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-4">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`Mã VietQR thanh toán phòng ${roomNumber} tháng ${bill.month}`}
              className="h-auto w-full max-w-72"
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Chưa có thông tin tài khoản nhận tiền.
            </p>
          )}
          {bankCode && bankAccount && bankOwner ? (
            <p className="text-center text-xs text-muted-foreground">
              {bankCode} · {bankAccount} · {bankOwner}
            </p>
          ) : null}
          <p className="text-center text-sm">
            Quét mã để chuyển khoản đúng số tiền và nội dung.
          </p>
        </div>
      </article>
    </main>
  )
}
