import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_70px_rgba(2,8,23,0.4)] backdrop-blur-2xl",
        className,
      )}
      {...props}
    />
  );
}

