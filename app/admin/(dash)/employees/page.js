import { redirect } from "next/navigation";

// The schedule and the employee list live in Square now (Square Team).
export default function Gone() {
  redirect("/admin");
}
