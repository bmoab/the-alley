// Single source of truth for admin navigation. Used by the desktop sidebar
// (AdminNav) and the mobile bottom bar + "More" sheet (BottomNav).
import {
  LayoutDashboard,
  CalendarDays,
  Inbox,
  Wallet,
  Building2,
  Store,
  LayoutGrid,
  Settings,
  ClipboardList,
  Activity,
  Users,
  LayoutTemplate,
  ShoppingBag,
  Package,
  PackageOpen,
  Tags,
  ClipboardCheck,
  Handshake,
  Receipt,
  Coins,
  ChartNoAxesCombined,
} from "lucide-react";

// Full navigation, in sidebar order. Items are either a link
// { href, label, icon } or a group { group, icon, items:[...] }.
export const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  {
    group: "Events",
    icon: CalendarDays,
    items: [
      // One page for the calendar, every booking and every listing.
      { href: "/admin/events", label: "List of events", icon: ClipboardList },
      // Requests (approve/deny) and Deposits (refunds) are booking-management
      // surfaces — hidden from a limited "user" (server-guarded regardless).
      { href: "/admin/requests", label: "Requests", icon: Inbox, needsBookings: true },
      { href: "/admin/deposits", label: "Deposits", icon: Wallet, needsBookings: true },
      { href: "/admin/activity", label: "Activity", icon: Activity },
    ],
  },
  // The whole Alley's finances. Owners and admins.
  { href: "/admin/money", label: "Money", icon: ChartNoAxesCombined, needsStaff: true },
  {
    group: "Shop",
    icon: ShoppingBag,
    items: [
      { href: "/admin/inventory", label: "Inventory", icon: Package },
      { href: "/admin/inventory/dropoffs", label: "Drop-offs", icon: PackageOpen },
      { href: "/admin/inventory/tags", label: "Price tags", icon: Tags },
      { href: "/admin/inventory/count", label: "Shelf count", icon: ClipboardCheck },
      { href: "/admin/vendors", label: "Makers", icon: Handshake },
      { href: "/admin/sales", label: "Sales", icon: Receipt },
      { href: "/admin/staff-costs", label: "Shared staff cost", icon: Coins, needsStaff: true },
    ],
  },
  { href: "/admin/directory", label: "Directory", icon: Building2 },
  { href: "/admin/exhibitors", label: "Exhibitors", icon: Store },
  {
    group: "Site Content",
    icon: LayoutGrid,
    items: [
      { href: "/admin/pages", label: "Pages", icon: LayoutTemplate },
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
 * { isOwner, canManageBookings, canManageStaff }. Drops owner-only items when
 * not an owner, booking-management items when the user can't manage bookings and
 * staff items (schedule, employees) when they can't manage staff,
 * then prunes any group left empty. (A bare boolean is still accepted as legacy isOwner.)
 */
export function navFor(perms = {}) {
  const p = typeof perms === "boolean" ? { isOwner: perms } : perms;
  const allowed = (item) =>
    (!item.ownerOnly || p.isOwner) &&
    (!item.needsBookings || p.canManageBookings) &&
    (!item.needsStaff || p.canManageStaff);
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
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/inventory", label: "Shop", icon: Package },
];

const ALL_HREFS = NAV.flatMap((item) => (item.group ? item.items.map((i) => i.href) : [item.href]));

// Helper shared by both nav surfaces. A page under a longer nav entry belongs
// to that entry alone (Drop-offs, not Inventory too).
export function isActive(pathname, href) {
  if (href === "/admin") return pathname === "/admin";
  const matches = (h) => pathname === h || pathname.startsWith(h + "/");
  if (!matches(href)) return false;
  return !ALL_HREFS.some((other) => other.length > href.length && other.startsWith(href + "/") && matches(other));
}

/** A group's bubble: the sum of its pages' counts. */
export function groupCount(counts = {}, items = []) {
  return items.reduce((t, i) => t + (counts[i.href] || 0), 0);
}
