import { TAG_FORMATS, TAG_CODES } from "@/lib/inventory.js";

/** Label type, QR or barcode, and "start at" for a part-used sheet. Shared by every Print tags form. */
export default function TagFormatFields({ format = "sheet30" }) {
  return (
    <>
      <div className="min-w-[14rem] flex-1">
        <label className="label">Labels</label>
        <select name="format" defaultValue={format} className="field">
          {Object.entries(TAG_FORMATS).map(([k, f]) => (
            <option key={k} value={k}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
<div className="w-36">
        <label className="label">Code</label>
        <select name="code" defaultValue="qr" className="field">
          {Object.entries(TAG_CODES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="w-28">
        <label className="label">Start at label #</label>
        <input name="start_at" inputMode="numeric" defaultValue="1" className="field" />
      </div>
    </>
  );
}
