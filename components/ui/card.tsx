// components/ui/card.tsx
import * as React from "react";
import { cn } from "@/lib/classnames"; // Updated import to use named export

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("rounded-xl border bg-background shadow p-4", className)}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";