import { redirect } from "next/navigation";

// Booking is now a modal opened from the Spaces page (and any "Request to Book"
// CTA). Keep this route working by sending it to Spaces with the modal open.
export default function BookPage() {
  redirect("/spaces#book");
}
