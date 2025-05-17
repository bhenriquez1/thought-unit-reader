"use client"

import * as React from "react"
import { Switch as HeadlessSwitch } from "@headlessui/react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const switchVariants = cva(
  "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
  {
    variants: {
      checked: {
        true: "bg-primary",
        false: "bg-input",
      },
      disabled: {
        true: "opacity-50 cursor-not-allowed",
        false: "",
      },
    },
  }
)

interface SwitchProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof HeadlessSwitch>,
    "checked" | "onChange"
  > {
  checked: boolean
  onChange: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onChange, ...props }, ref) => {
    return (
      <HeadlessSwitch
        ref={ref}
        checked={checked}
        onChange={onChange}
        className={cn(
          switchVariants({
            checked,
            disabled: props.disabled ?? false,
          }),
          className
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </HeadlessSwitch>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }