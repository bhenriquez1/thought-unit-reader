"use client";

import * as React from "react";
import { Switch as HeadlessSwitch } from "@headlessui/react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

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
    defaultVariants: {
      checked: false,
      disabled: false,
    },
  }
);

export interface SwitchProps
  extends Omit<React.ComponentProps<typeof HeadlessSwitch>, "onChange" | "checked"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <HeadlessSwitch
        ref={ref}
        checked={checked}
        onChange={onCheckedChange} // ✅ Directly pass boolean handler
        className={cn(switchVariants({ checked }), className)}
        {...props}
      />
    );
  }
);

Switch.displayName = "Switch";

export { Switch };