// components/ui/switch.tsx
import * as React from "react";
import { cn } from "@/lib/classnames"; // Updated import to use named export

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  id?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, id, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => onCheckedChange(!checked)}
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
      </button>
    );
  }
);

Switch.displayName = "Switch";
export { Switch };