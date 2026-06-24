import Link from "next/link";
import { Stripes } from "@/components/site/Primitives.js";

export default function CtaBand({ heading, subtitle }) {
  return (
    <div className="cta-band">
      <div className="wrap cta-inner">
        <div>
          <Stripes count={4} className="reveal" />
          <h2 className="cta-title" style={{ marginTop: 18 }} data-edit="home_cta_heading">
            {heading || (
              <>
                Bring your gathering
                <br />
                to The Alley.
              </>
            )}
          </h2>
          <p className="cta-sub" data-edit="home_cta_subtitle">{subtitle || "You bring the idea. We'll help with the space."}</p>
        </div>
        <Link className="btn btn--verde" href="/spaces">
          Request to Book a Space
        </Link>
      </div>
    </div>
  );
}
