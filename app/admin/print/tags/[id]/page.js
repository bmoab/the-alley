import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth.js";
import { tagSheet } from "@/lib/inventory.js";
import { formatMoney } from "@/lib/constants.js";
import Barcode from "@/components/Barcode.js";
import QrCode from "@/components/QrCode.js";
import { code128 } from "@/lib/barcode.js";
import PrintButton from "@/components/admin/PrintButton.js";

export const metadata = { title: "Price tags" };
export const dynamic = "force-dynamic";

/**
 * Label geometry, in inches, straight off the label makers' templates. The
 * page has no margins of its own: every offset here is from the paper's edge,
 * which is why it must print at "Actual size", never "Fit to page".
 */
const LAYOUT = {
  sheet30: { page: [8.5, 11], top: 0.5, left: 0.1875, cols: 3, rows: 10, w: 2.625, h: 1, gapX: 0.125, module: 0.016, bar: 0.34, qr: 0.9 },
  sheet80: { page: [8.5, 11], top: 0.5, left: 0.28125, cols: 4, rows: 20, w: 1.75, h: 0.5, gapX: 0.3125, module: 0.011, bar: 0.22, qr: 0.48 },
  roll: { page: [2, 1], top: 0, left: 0, cols: 1, rows: 1, w: 2, h: 1, gapX: 0, module: 0.015, bar: 0.3, qr: 0.9 },
  roll15: { page: [1.5, 1], top: 0, left: 0, cols: 1, rows: 1, w: 1.5, h: 1, gapX: 0, module: 0.012, bar: 0.28, qr: 0.86 },
};

/**
 * QR version: the code on the left, words on the right. The QR draws its own
 * white border, so it sits flush with the label's edge.
 */
function QrTag({ tag, kind, L }) {
  const small = kind === "sheet80";
  return (
    <div style={{ width: `${L.w}in`, height: `${L.h}in` }} className="flex items-center overflow-hidden text-black">
      {tag.sku ? (
        <QrCode value={tag.sku} size={`${L.qr}in`} className="shrink-0" />
      ) : (
        <span className="shrink-0 text-center" style={{ width: `${L.qr}in`, fontSize: "6pt" }}>no code yet</span>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center pr-[0.06in]" style={{ lineHeight: 1.15 }}>
        <span className="font-bold" style={{ fontSize: small ? "8pt" : "12pt" }}>
          {tag.price != null ? formatMoney(tag.price) : ""}
        </span>
        <span
          className="font-semibold"
          style={{ fontSize: small ? "5.5pt" : "7pt", display: "-webkit-box", WebkitLineClamp: small ? 1 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {tag.name}
        </span>
        {!small && tag.maker ? (
          <span className="truncate" style={{ fontSize: "6pt", color: "#444" }}>{tag.maker}</span>
        ) : null}
        {tag.sku ? <span style={{ fontSize: small ? "5pt" : "6pt", letterSpacing: "0.06em" }}>{tag.sku}</span> : null}
      </div>
    </div>
  );
}

/**
 * Bar width for this SKU on this label: the layout's width, narrowed until the
 * whole barcode (quiet zones included) fits. A long SKU — a manufacturer's
 * code, say — that would need bars thinner than a scanner reads gets null.
 */
function moduleFor(sku, L, small) {
  let modules;
  try {
    modules = code128(String(sku)).modules;
  } catch {
    return null;
  }
  const room = L.w - (small ? 0.16 : 0.2);
  const m = Math.min(L.module, room / modules);
  return m >= 0.0075 ? Number(m.toFixed(4)) : null;
}

function Tag({ tag, kind, L, qr }) {
  if (!tag) return <div />;
  const small = kind === "sheet80";
  const module = tag.sku && !qr ? moduleFor(tag.sku, L, small) : null;
  // QR when asked for — or when this SKU is too long to print as bars here.
  if (qr || (tag.sku && !module)) return <QrTag tag={tag} kind={kind} L={L} />;
  return (
    <div
      style={{ width: `${L.w}in`, height: `${L.h}in`, padding: small ? "0.03in 0.08in" : "0.06in 0.1in" }}
      className="flex flex-col justify-between overflow-hidden text-black"
    >
      <div className="flex items-start justify-between gap-1" style={{ fontSize: small ? "6pt" : "8pt", lineHeight: 1.15 }}>
        <span className="min-w-0 flex-1 truncate font-semibold">{tag.name}</span>
        <span className="shrink-0 font-bold" style={{ fontSize: small ? "8pt" : "12pt" }}>
          {tag.price != null ? formatMoney(tag.price) : ""}
        </span>
      </div>
      <div className="flex flex-col items-center">
        {tag.sku ? (
          <>
            <Barcode value={tag.sku} height={`${L.bar}in`} moduleWidth={`${module}in`} />
            <span style={{ fontSize: small ? "5pt" : "7pt", letterSpacing: "0.08em" }}>{tag.sku}</span>
          </>
        ) : (
          <span style={{ fontSize: "7pt" }}>no barcode yet</span>
        )}
      </div>
      {!small && tag.maker ? (
        <div className="truncate text-center" style={{ fontSize: "6.5pt", color: "#444" }}>
          {tag.maker}
        </div>
      ) : null}
    </div>
  );
}

export default async function TagPrintPage({ params, searchParams }) {
  await requireAdmin();
  const sheet = await tagSheet(Number(params.id));
  if (!sheet) notFound();
  const kind = sheet.job.format;
  const L = LAYOUT[kind];
  const perPage = L.cols * L.rows;
  const cells = [...Array(Math.max(0, sheet.job.start_at - 1)).fill(null), ...sheet.tags];
  const pages = [];
  for (let i = 0; i < cells.length; i += perPage) pages.push(cells.slice(i, i + perPage));
  const back = searchParams?.back && String(searchParams.back).startsWith("/admin/") ? searchParams.back : "/admin/inventory/tags";

  return (
    <div className="bg-paper-dim print:bg-white">
      {/* Raw, not a text child: React would escape the ">" in the selectors below. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @page { size: ${L.page[0]}in ${L.page[1]}in; margin: 0; }
        @media print { html, body { background: #fff !important; } }
        .tag-page { width: ${L.page[0]}in; height: ${L.page[1]}in; box-sizing: border-box;
          padding: ${L.top}in 0 0 ${L.left}in; display: grid;
          grid-template-columns: repeat(${L.cols}, ${L.w}in); grid-auto-rows: ${L.h}in; column-gap: ${L.gapX}in;
          background: #fff; break-after: page; overflow: hidden; }
        .tag-page:last-child { break-after: auto; }
        @media screen { .tag-page { margin: 0 auto 0.4in; box-shadow: 0 1px 6px rgba(0,0,0,.15); }
          .tag-page > div { outline: 1px dashed #ddd; } }
      `,
        }}
      />
      <div className="admin-ui mx-auto max-w-3xl px-4 py-5 print:hidden">
        <Link href={back} className="text-sm font-semibold text-ink-muted hover:text-ink">← Back</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">
            {sheet.tags.length} price tag{sheet.tags.length === 1 ? "" : "s"}
          </h1>
          <PrintButton>Print tags</PrintButton>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          {sheet.format.label}. In the print box choose <strong>Actual size / 100%</strong> (not &ldquo;Fit to page&rdquo;) and
          turn off headers and footers, or the tags won&apos;t line up with the labels.
          {!kind.startsWith("roll") ? " Print one on plain paper first and hold it up to a label sheet to check." : ""}
        </p>
        {sheet.tags.some((t) => !t.sku) ? (
          <p className="mt-2 text-sm text-rust">
            Some of these have no barcode number yet — give them one on Price tags, then print again.
          </p>
        ) : null}
      </div>
      {pages.map((cellsOnPage, i) => (
        <div key={i} className="tag-page">
          {cellsOnPage.map((tag, j) => (
            <Tag key={j} tag={tag} kind={kind} L={L} qr={sheet.job.code === "qr"} />
          ))}
        </div>
      ))}
    </div>
  );
}
