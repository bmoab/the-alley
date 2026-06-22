import { cx } from "./cx.js";

/**
 * Standardized admin table. Wraps the overflow-x scroll + min-width + header /
 * row styling that was hand-written per page. Compose with Th / Td, or pass
 * `columns` + `rows` for the simple case.
 *
 * Simple usage:
 *   <DataTable columns={["Name", "Date", "Status"]} minWidth={640}>
 *     {rows.map(r => <Tr key={r.id}>...<Td>...</Td></Tr>)}
 *   </DataTable>
 */
export function DataTable({ columns, minWidth = 640, className, children }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table
        className={cx("w-full border-collapse text-sm", className)}
        style={{ minWidth }}
      >
        {columns ? (
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
              {columns.map((c, i) => (
                <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ className, children, ...props }) {
  return (
    <tr
      className={cx(
        "border-b border-line/70 transition-colors hover:bg-paper-dim",
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function Td({ className, children, ...props }) {
  return (
    <td className={cx("px-3 py-3 align-middle text-ink-soft", className)} {...props}>
      {children}
    </td>
  );
}

export function Th({ className, children, ...props }) {
  return (
    <th
      className={cx(
        "whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export default DataTable;
