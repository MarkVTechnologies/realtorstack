"use client";

import { useInView } from "react-intersection-observer";
import { cn } from "@/lib/cn";

/**
 * Fades content up as it scrolls into view. The animation itself is CSS (.reveal), so public
 * pages stay light; content is visible without JS thanks to the <noscript>-safe default below.
 */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" }) {
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: "0px 0px -8% 0px", fallbackInView: true });
  return (
    <Tag ref={ref} className={cn("reveal", inView && "is-visible", className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
