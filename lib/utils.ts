import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils" // ✅ Corrected import path

import type { VariantProps } from "class-variance-authority"

const switchVariants = cva(
  "peer inline-flex shrink-0 h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
  {
    variants: {
      variant: {
        default: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type SwitchProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof switchVariants> & {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, variant, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange(event.target.checked)
    }

    return (
      <button
        ref={ref}
        role="switch"
        aria-checked={checked}
        className={cn(switchVariants({ variant }), className)}
        {...props}
      >
        <span className="sr-only">Toggle</span>
        <input
          type="checkbox"
          className="hidden"
          checked={checked}
          onChange={handleChange}
        />
        <span
          className="
            pointer-events-none
            inline-block
            h-5
            w-5
            rounded-full
            bg-background
            shadow-lg
            ring-0
            transition-transform
            duration-200
            ease-in-out
            peer-checked:translate-x-5
            peer-checked:bg-primary
          "
        />
      </button>
    )
  }
)

Switch.displayName = "Switch"

export { Switch }
