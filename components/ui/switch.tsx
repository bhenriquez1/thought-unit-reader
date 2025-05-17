import * as React from "react"
import { Switch as HeadlessSwitch } from "@headlessui/react"
import { cn } from "../../lib/utils"

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

const Switch = ({ checked, onChange, className }: SwitchProps) => {
  return (
    <HeadlessSwitch
      checked={checked}
      onChange={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
        checked ? "bg-blue-600" : "bg-gray-300",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </HeadlessSwitch>
  )
}

export { Switch }