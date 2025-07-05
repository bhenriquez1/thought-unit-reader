typescript// components/ui/switch.tsx
import * as React from "react";
import { Switch as HeadlessSwitch } from "@headlessui/react";
import { cn } from '../../lib/utils';

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof HeadlessSwitch> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, ...props }, ref) => {
    return (
      <HeadlessSwitch
        ref={ref}
        onChange={onCheckedChange}
        checked={checked}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          checked ? "bg-blue-600" : "bg-gray-300",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        {...props}
      >
        <span className="sr-only">Toggle setting</span>
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </HeadlessSwitch>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };