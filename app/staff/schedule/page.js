import { redirect } from "next/navigation";

// The schedule lives in Square now (the Square Team app).
export default function Gone() {
  redirect("/staff");
}
