import { notFound } from "next/navigation";
import { requireAccount, makerForAccount } from "@/lib/accounts.js";
import MakerHome from "@/components/maker/MakerHome.js";

export const metadata = { title: "Consignment" };

export default async function ConsignPage({ params }) {
  const account = await requireAccount(`/account/consign/${params.id}`);
  const vendor = makerForAccount(account, params.id);
  if (!vendor) notFound();
  return <MakerHome vendorId={vendor.id} hidden={{ vendor_id: String(vendor.id) }} />;
}
