"use client"

import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { useUserRole } from "@/hooks/use-user-role"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BANK_LIST, normalizeBankCode } from "@/lib/banks"
import { formatMoneyInput, parseMoneyInput } from "@/lib/money-input"
import { createSupabaseClient } from "@/utils/supabase/client"

type SettingsFormState = {
  hostelName: string
  bankCode: string
  bankAccount: string
  bankOwner: string
  electricPrice: string
  waterPrice: string
  servicePrice: string
}

type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

const emptyForm: SettingsFormState = {
  hostelName: "",
  bankCode: "",
  bankAccount: "",
  bankOwner: "",
  electricPrice: "",
  waterPrice: "",
  servicePrice: "",
}

function toBankOwner(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function toInputValue(value: number | string | null) {
  if (value === null) return ""
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? formatMoneyInput(number) : ""
}

function describeSupabaseError(error: SupabaseErrorLike) {
  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" — ")
}

export function SettingsForm() {
  const { isAdmin } = useUserRole()
  const [form, setForm] = useState<SettingsFormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const supabase = createSupabaseClient()
      const { data, error: queryError } = await supabase
        .from("settings")
        .select(
          "hostel_name, bank_code, bank_account, bank_owner, electric_price, water_price, service_price"
        )
        .eq("id", 1)
        .maybeSingle()

      if (queryError) {
        const missingColumn =
          queryError.code === "PGRST204" ||
          /hostel_name|bank_code|bank_account|bank_owner/i.test(
            queryError.message ?? ""
          )
        if (!missingColumn) {
          console.log(
            `Không tải được cấu hình: ${describeSupabaseError(queryError)}`
          )
        }
        const prices = await supabase
          .from("settings")
          .select("electric_price, water_price, service_price")
          .eq("id", 1)
          .maybeSingle()
        if (!prices.error && prices.data) {
          setForm({
            ...emptyForm,
            electricPrice: toInputValue(prices.data.electric_price),
            waterPrice: toInputValue(prices.data.water_price),
            servicePrice: toInputValue(prices.data.service_price),
          })
        }
        setError(
          missingColumn
            ? "Bảng settings chưa có cột hostel_name, bank_code, bank_account, bank_owner."
            : "Không tải được cấu hình. Vui lòng thử lại."
        )
        return
      }

      if (!data) {
        setError("Chưa có dòng cấu hình với id = 1 trong bảng settings.")
        return
      }

      setForm({
        hostelName: textValue(data.hostel_name),
        bankCode: normalizeBankCode(data.bank_code),
        bankAccount: textValue(data.bank_account).replace(/[^0-9]/g, ""),
        bankOwner: textValue(data.bank_owner),
        electricPrice: toInputValue(data.electric_price),
        waterPrice: toInputValue(data.water_price),
        servicePrice: toInputValue(data.service_price),
      })
    } catch (loadError) {
      console.error("Không tải được cấu hình:", loadError)
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không tải được cấu hình giá. Vui lòng thử lại."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isAdmin) return
    setError(null)
    setSuccess(null)

    const formData = new FormData(event.currentTarget)
    const hostelName = String(formData.get("hostel_name") ?? "").trim()
    const bankCode = normalizeBankCode(formData.get("bank_code"))
    const bankAccount = String(formData.get("bank_account") ?? "").replace(/[^0-9]/g, "")
    const bankOwner = toBankOwner(String(formData.get("bank_owner") ?? "")).trim()
    const electricPrice = parseMoneyInput(String(formData.get("electric_price") ?? ""))
    const waterPrice = parseMoneyInput(String(formData.get("water_price") ?? ""))
    const servicePrice = parseMoneyInput(String(formData.get("service_price") ?? ""))

    if (!Number.isFinite(electricPrice) || electricPrice < 0) {
      setError("Giá điện phải là số không âm.")
      return
    }
    if (!Number.isFinite(waterPrice) || waterPrice < 0) {
      setError("Giá nước phải là số không âm.")
      return
    }
    if (!Number.isFinite(servicePrice) || servicePrice < 0) {
      setError("Phí dịch vụ phải là số không âm.")
      return
    }

    setSaving(true)

    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from("settings")
        .update({
          hostel_name: hostelName,
          bank_code: bankCode,
          bank_account: bankAccount,
          bank_owner: bankOwner,
          electric_price: electricPrice,
          water_price: waterPrice,
          service_price: servicePrice,
        })
        .eq("id", 1)
        .select(
          "id, hostel_name, bank_code, bank_account, bank_owner, electric_price, water_price, service_price"
        )

      if (error) {
        console.log(error)
        setError(
          error.message || "Không lưu được cấu hình. Vui lòng thử lại."
        )
        return
      }

      const saved = data?.[0]
      if (!saved) {
        console.log(error)
        setError(
          "Không cập nhật được dòng settings có id = 1. Hãy kiểm tra quyền ghi của bảng settings."
        )
        return
      }

      setForm({
        hostelName: textValue(saved.hostel_name),
        bankCode: normalizeBankCode(saved.bank_code),
        bankAccount: textValue(saved.bank_account).replace(/[^0-9]/g, ""),
        bankOwner: textValue(saved.bank_owner),
        electricPrice: toInputValue(saved.electric_price),
        waterPrice: toInputValue(saved.water_price),
        servicePrice: toInputValue(saved.service_price),
      })
      setSuccess("Đã lưu cấu hình.")
      window.dispatchEvent(new Event("settingsUpdated"))
    } catch (saveError) {
      console.log(saveError)
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không lưu được cấu hình. Vui lòng thử lại."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cấu hình</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lưu đơn giá điện, nước và phí dịch vụ.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Đơn giá mặc định</CardTitle>
          <CardDescription>
            Giá trị hiện tại của dòng cấu hình id = 1.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="hostel-name">Tên nhà trọ</Label>
              <Input
                id="hostel-name"
                name="hostel_name"
                type="text"
                value={form.hostelName}
                disabled={loading || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    hostelName: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bank-code">Mã ngân hàng</Label>
              <input type="hidden" name="bank_code" value={form.bankCode} />
              <Select
                value={form.bankCode || undefined}
                disabled={loading || saving}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    bankCode: value,
                  }))
                }
              >
                <SelectTrigger id="bank-code" className="w-full">
                  <SelectValue placeholder="Chọn ngân hàng" />
                </SelectTrigger>
                <SelectContent className="z-[70]" position="popper">
                  {BANK_LIST.map((bank) => (
                    <SelectItem key={bank.code} value={bank.code}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bank-account">Số tài khoản</Label>
              <Input
                id="bank-account"
                name="bank_account"
                type="text"
                inputMode="numeric"
                value={form.bankAccount}
                disabled={loading || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bankAccount: event.target.value.replace(/[^0-9]/g, ""),
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bank-owner">Tên chủ tài khoản</Label>
              <Input
                id="bank-owner"
                name="bank_owner"
                type="text"
                value={form.bankOwner}
                disabled={loading || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bankOwner: toBankOwner(event.target.value),
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="electric-price">Giá điện (VNĐ/số)</Label>
              <Input
                id="electric-price"
                name="electric_price"
                type="text"
                inputMode="numeric"
                value={form.electricPrice}
                disabled={loading || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    electricPrice: formatMoneyInput(event.target.value),
                  }))
                }
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="water-price">Giá nước (VNĐ/khối)</Label>
              <Input
                id="water-price"
                name="water_price"
                type="text"
                inputMode="numeric"
                value={form.waterPrice}
                disabled={loading || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    waterPrice: formatMoneyInput(event.target.value),
                  }))
                }
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="service-price">
                Phí dịch vụ mặc định (VNĐ/phòng)
              </Label>
              <Input
                id="service-price"
                name="service_price"
                type="text"
                inputMode="numeric"
                value={form.servicePrice}
                disabled={loading || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    servicePrice: formatMoneyInput(event.target.value),
                  }))
                }
                required
              />
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p
                className="rounded-lg bg-muted px-3 py-2 text-sm font-medium"
                role="status"
              >
                {success}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={loading || saving || !isAdmin}>
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
