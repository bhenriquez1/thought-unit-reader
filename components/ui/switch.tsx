import * as React from "react";
import { Switch as HeadlessSwitch } from "@headlessui/react";
import { cn } from "../../lib/utils"; // ✅ Fixed import path

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof HeadlessSwitch> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, ...props }, ref) => {
    return (
      <HeadlessSwitch
        ref={ref}
        onChange={onCheckedChange}
        checked={checked}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition",
          checked ? "bg-blue-600" : "bg-gray-300",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </HeadlessSwitch>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
