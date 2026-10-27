import { redirect } from "next/navigation";

/** The inbox became Activity — its emails are under Activity → Emails. */
export default function OldInbox() {
  redirect("/account/activity?type=email");
}
