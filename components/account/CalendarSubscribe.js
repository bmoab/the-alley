"use client";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";

/**
 * "Put The Alley's calendar on your phone": one-tap subscribe links for Apple
 * and Google Calendar, the feed address to copy for anything else, and short
 * directions. The feed is the website's public events (app/calendar.ics), so
 * new events and changes show up on their own.
 */
export default function CalendarSubscribe({ feedUrl, wide = true }) {
  const [copied, setCopied] = useState(false);
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`ac-tile ac-rise ${wide ? "ac-tile--wide" : ""}`}>
      <div className="ac-tile-head">
        <span className="ac-icon">
          <CalendarPlus aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="ac-eyebrow">The Alley calendar</p>
          <h2 className="ac-tile-title">Put our events on your phone</h2>
        </div>
      </div>
      <p className="ac-tile-body">
        Subscribe once and every event at The Alley shows up in your own calendar, including the ones you post. New events
        and changes come through on their own.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <a href={webcal} className="ac-btn ac-btn--auto">
          iPhone or Mac
        </a>
        <a href={google} target="_blank" rel="noreferrer" className="ac-btn ac-btn--ghost ac-btn--auto">
          Google Calendar
        </a>
        <button type="button" onClick={copy} className="ac-btn ac-btn--ghost ac-btn--auto">
          {copied ? "Link copied" : "Copy the link"}
        </button>
      </div>
      <details>
        <summary className="ac-small" style={{ fontWeight: 600 }}>How to subscribe</summary>
        <ul className="ac-small" style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
          <li>
            <strong>iPhone, iPad or Mac:</strong> tap <em>iPhone or Mac</em>, then <em>Subscribe</em>. It appears in the
            Calendar app as &ldquo;The Alley On Center — Events&rdquo;.
          </li>
          <li>
            <strong>Google Calendar:</strong> tap <em>Google Calendar</em> and choose <em>Add</em>. On a phone, open it on a
            computer the first time, then it shows in the Google Calendar app too. New events can take up to a day to appear
            in Google.
          </li>
          <li>
            <strong>Outlook or anything else:</strong> copy the link and add it as a calendar &ldquo;from the internet&rdquo;
            or &ldquo;by URL&rdquo;.
          </li>
          <li>To stop, delete or unsubscribe from the calendar in your calendar app.</li>
        </ul>
      </details>
    </div>
  );
}
