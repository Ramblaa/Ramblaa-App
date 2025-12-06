import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-brand-700",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-ink-200",
        destructive:
          "border-transparent bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
        outline: "text-foreground border-border",
        success: "border-transparent bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
        warning: "border-transparent bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
        info: "border-transparent bg-brand-100 text-brand-800 hover:bg-brand-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants } 