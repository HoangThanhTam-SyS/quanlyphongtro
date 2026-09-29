import type { Metadata } from "next"

import { TenantsManager } from "@/components/tenants/tenants-manager"

export const metadata: Metadata = {
  title: "Khách thuê",
}

export default function KhachThuePage() {
  return <TenantsManager />
}
