import * as React from "react"
import { Switch as HeadlessSwitch } from "@headlessui/react"
import { cn } from "@/lib/utils"

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

const Switch = ({ checked, onCheckedChange }: SwitchProps) => {
  return (
    <HeadlessSwitch
      checked={checked}
      onChange={onCheckedChange}
      className={cn(
        "relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </HeadlessSwitch>
  )
}

export { Switch }