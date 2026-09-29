"use client"

import { useState } from "react"
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSupabaseClient } from "@/utils/supabase/client"

function loginErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return "Email hoặc mật khẩu không đúng."
  }
  if (normalized.includes("email not confirmed")) {
    return "Email chưa được xác nhận. Hãy kiểm tra hộp thư trước khi đăng nhập."
  }
  return message || "Không đăng nhập được. Vui lòng thử lại."
}

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const nextEmail = email.trim()
    if (!nextEmail || !password) {
      setError("Vui lòng nhập email và mật khẩu.")
      return
    }

    setSubmitting(true)
    try {
      const supabase = createSupabaseClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: nextEmail,
        password,
      })

      if (signInError) {
        setError(loginErrorMessage(signInError.message))
        return
      }

      window.location.href = "/"
    } catch (caught) {
      setError(
        caught instanceof Error
          ? loginErrorMessage(caught.message)
          : "Không đăng nhập được. Vui lòng thử lại."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      {error ? (
        <p
          role="alert"
          className="fixed top-4 left-1/2 z-50 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-destructive/30 bg-background px-4 py-3 text-sm text-destructive shadow-lg"
        >
          {error}
        </p>
      ) : null}
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <CardTitle>Đăng nhập</CardTitle>
          <CardDescription>
            Dành cho quản trị viên hệ thống quản lý phòng trọ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-9"
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
