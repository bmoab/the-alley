import { redirect } from "next/navigation";

/** The inbox became Activity; an old link to one email still opens it. */
export default function OldMessage({ params }) {
  redirect(`/account/activity/email/${encodeURIComponent(params.id)}`);
}
