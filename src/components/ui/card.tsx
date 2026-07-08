"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

type CardState = "default" | "dragging" | "drop-valid" | "drop-invalid";

const stateClasses: Record<CardState, string> = {
  default: "border-gray-200 hover:border-gray-300 hover:shadow-md",
  dragging: "scale-95 border-gray-400 shadow-xl ring-2 ring-gray-300",
  "drop-valid":
    "border-2 border-blue-500 bg-blue-50 shadow-lg scale-105",
  "drop-invalid": "border-2 border-red-500 bg-red-50",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: CardState;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, state = "default", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative bg-white rounded-lg border transition-all duration-200",
          stateClasses[state],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";
