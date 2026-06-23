// Single source of truth for admin navigation. Used by the desktop sidebar
// (AdminNav) and the mobile bottom bar + "More" sheet (BottomNav).
import {
  LayoutDashboard,
  CalendarDays,
  Inbox,
  CalendarCheck,
  Wallet,
  Megaphone,
  Building2,
  Store,
  FileText,
  Image,
  Images,
  LayoutGrid,
  Settings,
  ClipboardList,
  History,
  Activity,
  Users,
} from "lucide-react";

// Full navigation, in sidebar order. Items are either a link
// { href, label, icon } or a group { group, icon, items:[...] }.
export const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  {
    group: "Reservations",
    icon: ClipboardList,
    items: [
      { href: "/admin/requests", label: "Requests", icon: Inbox },
      { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/admin/all-requests", label: "All Requests", icon: History },
      { href: "/admin/deposits", label: "Deposits", icon: Wallet },
      { href: "/admin/activity", label: "Activity", icon: Activity },
    ],
  },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/events", label: "Public Events", icon: Megaphone },
  { href: "/admin/directory", label: "Directory", icon: Building2 },
  { href: "/admin/exhibitors", label: "Exhibitors", icon: Store },
  {
    group: "Site Content",
    icon: LayoutGrid,
    items: [
      { href: "/admin/descriptors", label: "Descriptors", icon: FileText },
      { href: "/admin/site-photos", label: "Site Photos", icon: Image },
      { href: "/admin/spaces", label: "Spaces Photos", icon: Images },
      { href: "/admin/gallery", label: "Gallery", icon: LayoutGrid },
    ],
  },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  // Owner-only: managing admin accounts. Hidden for regular users (and the
  // route itself is guarded server-side).
  { href: "/admin/team", label: "Team", icon: Users, ownerOnly: true },
];

/**
 * NAV filtered for the current user. Drops owner-only items (and prunes any
 * group left empty) when `isOwner` is false.
 */
export function navFor(isOwner) {
  return NAV.flatMap((item) => {
    if (item.group) {
      const items = item.items.filter((sub) => isOwner || !sub.ownerOnly);
      return items.length ? [{ ...item, items }] : [];
    }
    return isOwner || !item.ownerOnly ? [item] : [];
  });
}

// The 4 primary destinations for the mobile bottom tab bar. Everything else
// lives behind the "More" tab/sheet.
export const PRIMARY_TABS = [
  { href: "/admin", label: "Home", icon: LayoutDashboard },
  { href: "/admin/requests", label: "Requests", icon: Inbox },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
];

// Helper shared by both nav surfaces.
export function isActive(pathname, href) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}
