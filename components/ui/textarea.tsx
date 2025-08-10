import * as React from "react";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/** Minimal textarea with sensible Tailwind defaults */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={
          "w-full min-h-[120px] rounded border border-gray-300 bg-white px-3 py-2 text-sm text-black " +
          "placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 " +
          "disabled:cursor-not-allowed disabled:opacity-50 " +
          className
        }
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
export { Textarea };