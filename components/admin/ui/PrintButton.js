"use client";
import { Printer } from "lucide-react";
import Button from "./Button.js";

/** Opens the browser's print dialog (where "Save as PDF" lives too). */
export default function PrintButton({ label = "Print", ...props }) {
  return (
    <Button type="button" icon={Printer} onClick={() => window.print()} {...props}>
      {label}
    </Button>
  );
}
