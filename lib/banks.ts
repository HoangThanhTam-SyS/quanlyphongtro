export const BANK_LIST = [
  { code: "VCB", name: "Vietcombank" },
  { code: "MB", name: "MBBank" },
  { code: "TCB", name: "Techcombank" },
  { code: "VPB", name: "VPBank" },
  { code: "BIDV", name: "BIDV" },
  { code: "CTG", name: "VietinBank" },
  { code: "VBA", name: "Agribank" },
  { code: "ACB", name: "ACB" },
  { code: "STB", name: "Sacombank" },
  { code: "HDB", name: "HDBank" },
  { code: "VIB", name: "VIB" },
  { code: "TPB", name: "TPBank" },
  { code: "SHB", name: "SHB" },
  { code: "MSB", name: "MSB" },
  { code: "OCB", name: "OCB" },
  { code: "EIB", name: "Eximbank" },
  { code: "LPB", name: "LPBank" },
  { code: "SEAB", name: "SeABank" },
  { code: "NAB", name: "Nam A Bank" },
  { code: "ABB", name: "ABBank" },
] as const

export function normalizeBankCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (!code) return ""
  return BANK_LIST.some((bank) => bank.code === code) ? code : code
}
