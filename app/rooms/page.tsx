import type { Metadata } from "next"

import { RoomsManager } from "@/components/rooms/rooms-manager"

export const metadata: Metadata = {
  title: "Phòng trọ",
}

export default function RoomsPage() {
  return <RoomsManager />
}
