export function formatMoneyInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "").replace(/^0+(?=\d)/, "")
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

export function parseMoneyInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
  if (!digits) return Number.NaN
  return Number(digits)
}
