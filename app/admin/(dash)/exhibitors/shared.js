import { exhibitorPhase } from "@/lib/catalog.js";
import { REMINDERS, reminderKindFor, reminderHistory, getParty } from "@/lib/agreement-reminders.js";

export { initials } from "../directory/shared.js";

const STATUS = {
  current: { key: "current", label: "On view", tone: "sage" },
  past: { key: "past", label: "Past", tone: "ink" },
  hidden: { key: "hidden", label: "Hidden", tone: "neutral" },
};

/** Where an artist stands on the Exhibitors page: { key, label, tone } (tone = a Badge tone). */
export function exhibitorStatus(ex) {
  return STATUS[exhibitorPhase(ex)];
}

/** Their portrait, or the first piece of their work. */
export function exhibitorPhoto(ex) {
  return ex.profile_photo || ex.works?.[0]?.image_path || null;
}

/**
 * Their agreement and its reminders. A linked maker's agreement is theirs
 * (one person, one date): { endsOn, history, due, dueLabel, href }.
 */
export function agreementState(ex) {
  const who = getParty("artist", ex.id);
  if (!who) return { endsOn: null, history: [], due: null };
  const history = reminderHistory(who.party, who.id).filter((h) => h.ends_on === who.endsOn);
  const kind = Number(ex.active) === 1 && who.email && who.endsOn ? reminderKindFor(who.endsOn) : null;
  const due = kind && !history.some((h) => h.kind === kind) ? kind : null;
  return {
    endsOn: who.endsOn,
    history,
    due,
    dueLabel: due ? REMINDERS[due].label : "",
    href: due ? `/admin/agreements/${who.party}/${who.id}?kind=${due}` : null,
  };
}
