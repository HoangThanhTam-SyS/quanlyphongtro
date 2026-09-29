"use client"

import { useEffect, useState } from "react"

import { readUserRole, type UserRole } from "@/lib/user-role"
import { createSupabaseClient } from "@/utils/supabase/client"

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void createSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return
        setRole(readUserRole(data.user))
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return {
    role,
    ready,
    isAdmin: role === "admin",
  }
}
