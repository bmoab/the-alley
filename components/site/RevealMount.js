"use client";
import { usePathname } from "next/navigation";
import { useReveal } from "@/components/hooks.js";

/**
 * Mounts the scroll-reveal observer for the whole public site. Re-scans on
 * route change so client-navigated pages animate their `.reveal` elements too.
 * Renders nothing.
 */
export default function RevealMount() {
  const pathname = usePathname();
  useReveal([pathname]);
  return null;
}
