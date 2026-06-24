import { redirect } from "next/navigation";

// Descriptors has been replaced by the visual Pages editor. Keep this route as a
// redirect so old bookmarks/links still land somewhere useful.
export default function DescriptorsRedirect() {
  redirect("/admin/pages/home");
}
