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
      { href: "/admin/deposits", label: "Deposits", icon: Wallet },
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
];

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
