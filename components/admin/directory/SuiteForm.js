"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Button from "../ui/Button.js";
import Toggle from "../ui/Toggle.js";
import { useDialog } from "../ui/Dialog.js";
import ContentImageField from "../../ContentImageField.js";

function Save() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save suite"}</Button>;
}

/**
 * Edit one suite, inside its dialog. An occupied suite only has its name here
 * (who's in it is set on each business); an empty one can be listed as
 * available to lease, with a photo and a line about it.
 */
export default function SuiteForm({ suite, occupants = [], action }) {
  const { close } = useDialog();
  const [error, setError] = useState("");
  const occupied = occupants.length > 0;
  return (
    <form
      action={async (fd) => {
        setError("");
        const res = await action(fd);
        if (res?.error) setError(res.error);
        else close();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={suite.id} />
      {occupied ? <input type="hidden" name="occupied" value="1" /> : null}
      <div>
        <label className="label" htmlFor={`suite-name-${suite.id}`}>Suite name or number</label>
        <input id={`suite-name-${suite.id}`} name="name" defaultValue={suite.name || ""} placeholder={suite.zone} className="field" />
      </div>
      {occupied ? (
        <p className="rounded-xl bg-paper-warm px-3 py-2 text-sm text-ink-soft">
          {occupants.join(" & ")} {occupants.length > 1 ? "are" : "is"} in this suite. To move someone, open their business and
          change their suites.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-line bg-paper-warm p-4">
            <Toggle
              name="available"
              defaultChecked={Number(suite.available) === 1}
              label="Available to lease"
              hint="Shows on the building map as available, with the photo and line below."
            />
          </div>
          <div>
            <label className="label" htmlFor={`suite-blurb-${suite.id}`}>A line about the space</label>
            <textarea
              id={`suite-blurb-${suite.id}`}
              name="vacant_blurb"
              rows={2}
              defaultValue={suite.vacant_blurb || ""}
              placeholder="A bright corner studio with street-facing windows…"
              className="field"
            />
          </div>
          <ContentImageField name="vacant_photo" label="Photo of the space" value={suite.vacant_photo || ""} />
        </>
      )}
      {error ? <p className="text-xs font-semibold text-rust">{error}</p> : null}
      <div className="flex justify-end">
        <Save />
      </div>
    </form>
  );
}
