import type { Metadata } from "next"

import { UsersManager } from "@/components/users/users-manager"

export const metadata: Metadata = {
  title: "Quản lý User",
}

export default function UsersPage() {
  return <UsersManager />
}
