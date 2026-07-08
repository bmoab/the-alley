/**
 * Display text for a tenant link button. The tenant's own label wins; without
 * one we guess from the URL's host so "Visit" only shows as a last resort.
 * Plain module — safe in both server and client components.
 */
export function directoryLinkLabel(link) {
  if (link?.label) return link.label;
  const url = link?.url || "";
  try {
    const u = new URL(url);
    if (u.protocol === "mailto:") return "Email";
    if (u.protocol === "tel:") return "Call";
    const host = u.hostname.replace(/^www\./, "");
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("facebook")) return "Facebook";
    if (host.includes("tiktok")) return "TikTok";
    if (host.includes("youtube") || host === "youtu.be") return "YouTube";
    if (host.includes("linkedin")) return "LinkedIn";
    if (host.includes("x.com") || host.includes("twitter")) return "X / Twitter";
    return host || "Website";
  } catch {
    if (url.startsWith("mailto:")) return "Email";
    if (url.startsWith("tel:")) return "Call";
    return "Visit";
  }
}
