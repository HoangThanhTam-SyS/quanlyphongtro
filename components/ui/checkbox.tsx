"use client"

import { useEffect, useRef } from "react"

import { cn } from "cn"

function Checkbox({
  checked,
  indeterminate = false,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate && !checked
    }
  }, [indeterminate, checked])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      className={cn("size-4 rounded border-input accent-primary", className)}
      {...props}
    />
  )
}

export { Checkbox }
