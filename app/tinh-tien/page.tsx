import type { Metadata } from "next"

import { BillsManager } from "@/components/bills/bills-manager"

export const metadata: Metadata = {
  title: "Tính tiền",
}

export default function TinhTienPage() {
  return <BillsManager />
}
