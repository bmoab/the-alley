/** Eyebrow + heading block with an optional right-aligned action. */
export default function SectionHead({ eyebrow, title, action, light }) {
  return (
    <div className="sec-head">
      <div>
        <p className="eyebrow" style={light ? { color: "rgba(255,255,255,.6)" } : null}>{eyebrow}</p>
        <h2 className="sec-title" style={light ? { color: "#fff" } : null}>{title}</h2>
      </div>
      {action}
    </div>
  );
}
