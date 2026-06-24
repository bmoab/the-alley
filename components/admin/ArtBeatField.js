"use client";
import { useState } from "react";
import StructuredListField from "./StructuredListField.js";

/**
 * Composite editor for the `art_beat` content key: { date, intro, ways } where
 * `ways` is a list of [title, description] pairs. Plain fields for date/intro
 * plus an embedded (controlled) StructuredListField for the ways — emits the
 * whole object as JSON into one hidden input so it posts with the form.
 */
function parse(value) {
  try {
    const v = JSON.parse(value || "{}");
    return {
      date: typeof v.date === "string" ? v.date : "",
      intro: typeof v.intro === "string" ? v.intro : "",
      ways: Array.isArray(v.ways) ? v.ways : [],
    };
  } catch {
    return { date: "", intro: "", ways: [] };
  }
}

const WAYS_SCHEMA = {
  kind: "tuples",
  addLabel: "Add a way to take part",
  fields: [
    { label: "What", placeholder: "Perform" },
    { label: "Describe it", placeholder: "Musicians and performers — share your sound.", textarea: true },
  ],
};

export default function ArtBeatField({ name = "art_beat", value = "{}" }) {
  const initial = parse(value);
  const [date, setDate] = useState(initial.date);
  const [intro, setIntro] = useState(initial.intro);
  const [ways, setWays] = useState(initial.ways);

  const payload = JSON.stringify({ date: date.trim(), intro: intro.trim(), ways });

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={payload} />

      <div>
        <label className="label" htmlFor="art_beat_date">Date &amp; place</label>
        <input
          id="art_beat_date"
          className="field"
          value={date}
          placeholder="August 29, 2026 · Logan, Utah"
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="art_beat_intro">Intro</label>
        <textarea
          id="art_beat_intro"
          rows={3}
          className="field"
          value={intro}
          placeholder="A day for the whole valley…"
          onChange={(e) => setIntro(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Ways to take part</label>
        <StructuredListField schema={WAYS_SCHEMA} value={JSON.stringify(ways)} onChange={setWays} />
      </div>
    </div>
  );
}
