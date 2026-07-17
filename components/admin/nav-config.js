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
  Image,
  Images,
  LayoutGrid,
  Settings,
  ClipboardList,
  Activity,
  Users,
  LayoutTemplate,
} from "lucide-react";

// Full navigation, in sidebar order. Items are either a link
// { href, label, icon } or a group { group, icon, items:[...] }.
export const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  {
    group: "Reservations",
    icon: ClipboardList,
    items: [
      // Requests (approve/deny) and Deposits (refunds) are booking-management
      // surfaces — hidden from a limited "user" (server-guarded regardless).
      { href: "/admin/requests", label: "Requests", icon: Inbox, needsBookings: true },
      { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/admin/deposits", label: "Deposits", icon: Wallet, needsBookings: true },
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
      { href: "/admin/pages", label: "Pages", icon: LayoutTemplate },
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
 * NAV filtered for the current user's capabilities. `perms` is
 * { isOwner, canManageBookings }. Drops owner-only items when not an owner and
 * booking-management items when the user can't manage bookings, then prunes any
 * group left empty. (A bare boolean is still accepted as legacy isOwner.)
 */
export function navFor(perms = {}) {
  const p = typeof perms === "boolean" ? { isOwner: perms } : perms;
  const allowed = (item) =>
    (!item.ownerOnly || p.isOwner) && (!item.needsBookings || p.canManageBookings);
  return NAV.flatMap((item) => {
    if (item.group) {
      const items = item.items.filter(allowed);
      return items.length ? [{ ...item, items }] : [];
    }
    return allowed(item) ? [item] : [];
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
