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
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    const handleChange = (event: React.FormEvent<HTMLButtonElement>) => {
      const target = event.currentTarget as HTMLInputElement;
      const isChecked = target.checked;
      onCheckedChange(isChecked);
    };

    return (
      <HeadlessSwitch
        ref={ref}
        checked={checked}
        onChange={handleChange}
        className={cn(switchVariants({ checked }), className)}
        {...props}
      />
    );
  }
);

Switch.displayName = "Switch";

export { Switch };