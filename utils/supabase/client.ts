import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseAnonKey, getSupabaseUrl } from "@/utils/supabase/env"

let browserClient: SupabaseClient | undefined

export function createSupabaseClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey())
  }

  return browserClient
}
