export function getSupabaseUrl() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) {
    throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL trong .env.local")
  }

  return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "")
}

export function getSupabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local")
  }

  return key
}
