import { Suspense } from "react";
import "./account.css";
import Toaster from "@/components/admin/ui/Toaster.js";

export const metadata = { title: { default: "Your account", template: "%s · The Alley On Center" } };
export const dynamic = "force-dynamic";

/**
 * Accounts for makers, renters, event hosts, tenants and exhibitors. The sign-in
 * pages ((auth)) and the signed-in pages ((app)) each bring their own frame;
 * this just sets the look (account.css) and the toasts.
 */
export default function AccountLayout({ children }) {
  return (
    <div className="ac">
      {children}
      <Suspense fallback={null}>
        {/* The account pages show ?error= codes in their own words, never the raw value. */}
        <Toaster ignore={["error"]} />
      </Suspense>
    </div>
  );
}
