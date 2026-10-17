import Link from "next/link";
import { getVendorByToken } from "@/lib/inventory.js";
import MakerHome from "@/components/maker/MakerHome.js";
import PortalFrame, { PortalMissing } from "@/components/account/PortalFrame.js";

export const metadata = { title: "Your consignment · The Alley On Center", robots: { index: false } };
// Per-token page: never cache one maker's view and serve it to another.
export const dynamic = "force-dynamic";

/** A maker's private link — the same page their account shows, no sign-in needed. */
export default function MakerLinkPage({ params }) {
  const vendor = getVendorByToken(params.token);
  return (
    <PortalFrame label="Consignment" toaster>
      {vendor ? (
        <MakerHome
          vendorId={vendor.id}
          hidden={{ token: params.token }}
          notice={
            vendor.email ? (
              <p className="ac-note">
                <span>
                  Prefer a password?{" "}
                  <Link href="/account/sign-up" style={{ fontWeight: 600, textDecoration: "underline" }}>
                    Create an account
                  </Link>{" "}
                  with {vendor.email} — it shows this, plus a copy of every email we send you, in one place.
                </span>
              </p>
            ) : null
          }
        />
      ) : (
        <PortalMissing>This link isn&apos;t active any more. Ask us for a new one, or sign in to your account.</PortalMissing>
      )}
    </PortalFrame>
  );
}
