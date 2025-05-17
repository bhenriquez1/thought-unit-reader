import * as React from "react"
import { Switch as HeadlessSwitch } from "@headlessui/react"
import { cn } from "@/lib/utils"

export function Switch({ className, ...props }) {
  return (
    <HeadlessSwitch
      {...props}
      className={({ checked }) =>
        cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition",
          checked ? "bg-primary" : "bg-input",
          className
        )
      }
    >
      {({ checked }) => (
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-background transition",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      )}
    </HeadlessSwitch>
  )
}