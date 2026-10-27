import { requireAdmin } from "@/lib/auth.js";
import { tourMode, TOUR_LINKS } from "@/lib/account-tour.js";
import AccountDashboard from "@/components/account/AccountDashboard.js";
import TourGuard from "@/components/admin/tour/TourGuard.js";
import { AccountChrome, PortalChrome } from "@/components/admin/tour/TourChrome.js";
import { TourActivity, TourEmail, TourSettings } from "@/components/admin/tour/pages/AccountPages.js";
import { TourBookings, TourListing, BOOKINGS_LABEL, LISTING_LABEL } from "@/components/admin/tour/pages/BookingPages.js";
import { TourBusiness, TourExhibitor, TourConsign, BUSINESS_LABEL, EXHIBITOR_LABEL } from "@/components/admin/tour/pages/TenantPages.js";
import "@/app/account/account.css";

export const metadata = { title: "Account tour", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The tour's pages, each in the frame the real one has: the account's own
 * pages (home, activity, settings, a maker's shop) in the account header, the
 * private-link pages (bookings, an event, a business, a gallery page) in the
 * portal header.
 */
const PAGES = {
  home: { tab: "home", body: (m) => <Dashboard m={m} /> },
  activity: { tab: "activity", body: (m, id, sp) => <TourActivity m={m} sp={sp} /> },
  email: { tab: "activity", body: (m, id) => <TourEmail m={m} id={id} /> },
  settings: { tab: "settings", body: (m) => <TourSettings m={m} /> },
  consign: { tab: "home", body: (m) => <TourConsign m={m} /> },
  bookings: { portal: BOOKINGS_LABEL, body: (m) => <TourBookings m={m} /> },
  listing: { portal: LISTING_LABEL, body: (m, id) => <TourListing m={m} id={id} /> },
  business: { portal: BUSINESS_LABEL, body: (m) => <TourBusiness m={m} /> },
  exhibitor: { portal: EXHIBITOR_LABEL, body: (m) => <TourExhibitor m={m} /> },
};

function Dashboard({ m }) {
  return (
    <AccountDashboard
      account={m.account}
      mine={m.mine}
      recent={m.activity.slice(0, 5)}
      makerStats={m.makerStats}
      bills={m.bills}
      schedule={m.schedule}
      demo={m.key}
    />
  );
}

/**
 * A customer's account as a sample person sees it, for the account tour's
 * preview window (Admin → Account tour). The same look and the real forms,
 * with sample data; nothing is saved, paid or uploaded.
 */
export default async function TourFrame({ searchParams }) {
  await requireAdmin();
  const m = tourMode(searchParams?.as);
  const page = PAGES[searchParams?.page] || PAGES.home;
  const body = page.body(m, searchParams?.id, searchParams || {});
  return (
    <div className="ac">
      {page.portal !== undefined ? (
        <PortalChrome m={m} label={page.portal}>
          {body}
        </PortalChrome>
      ) : (
        <AccountChrome m={m} tab={page.tab}>
          {body}
        </AccountChrome>
      )}
      <TourGuard links={TOUR_LINKS} />
    </div>
  );
}
