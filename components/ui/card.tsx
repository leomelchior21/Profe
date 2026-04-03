import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_12px_36px_rgba(2,8,23,0.22)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
