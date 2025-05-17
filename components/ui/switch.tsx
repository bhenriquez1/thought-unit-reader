import * as React from "react";
import { Switch as HeadlessSwitch } from "@headlessui/react";
import { cn } from "../../lib/utils"; // adjust path if needed

export interface SwitchProps extends React.ComponentProps<"button"> {
  checked?: boolean;
  onChange?: () => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onChange, ...props }, ref) => {
    return (
      <HeadlessSwitch
        ref={ref}
        checked={checked}
        onChange={onChange}
        className={cn(
          "relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
          checked ? "bg-primary" : "bg-input",
          className
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </HeadlessSwitch>
    );
  }
);
Switch.displayName = "Switch";