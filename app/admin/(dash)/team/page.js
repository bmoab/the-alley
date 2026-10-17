import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getCurrentUser,
  listUsers,
  createUser,
  setUserActive,
  setUserRole,
  isLastActiveOwner,
  normalizeRole,
  inviteUser,
  reinviteUser,
  isPendingInvite,
  resetLinkFor,
} from "@/lib/auth.js";
import { emailTeamInvite, emailPasswordReset } from "@/lib/email.js";
import { db } from "@/lib/db.js";
import CopyLink from "@/components/admin/CopyLink.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";
import { DataTable, Tr, Td } from "@/components/admin/ui/DataTable.js";

export const metadata = { title: "Team" };

const APP_URL = process.env.APP_URL || "http://localhost:3000";

function toast(message, type = "success") {
  redirect("/admin/team?toast=" + encodeURIComponent(message) + "&toastType=" + type);
}

async function requireOwner() {
  const me = await getCurrentUser();
  if (!me || me.role !== "owner") redirect("/admin");
  return me;
}

async function addUser(formData) {
  "use server";
  const me = await requireOwner();
  const firstName = (formData.get("first_name") || "").toString().trim();
  const lastName = (formData.get("last_name") || "").toString().trim();
  const email = (formData.get("email") || "").toString().trim();
  const role = normalizeRole(formData.get("role"));
  let invite;
  try {
    invite = inviteUser({ firstName, lastName, email, role, createdBy: me.id });
  } catch (err) {
    toast(err.message || "Could not add that person.", "error");
  }
  const sent = await sendInvite(invite.user, invite.token, me);
  revalidatePath("/admin/team");
  toast(
    sent
      ? `Invite sent to ${invite.user.email}. They'll choose their own password from the email.`
      : `${firstName} is added, but the email didn't go — use “Copy invite link” beside their name and send it yourself.`,
    sent ? "success" : "error"
  );
}

async function sendInvite(user, token, me) {
  try {
    const r = await emailTeamInvite(user, `${APP_URL}/admin/welcome?token=${token}`, { invitedBy: me?.name || "" });
    return r?.ok !== false;
  } catch (err) {
    console.error("[team] invite email failed:", err.message);
    return false;
  }
}

async function resendInvite(formData) {
  "use server";
  const me = await requireOwner();
  let invite;
  try {
    invite = reinviteUser(Number(formData.get("id")));
  } catch (err) {
    toast(err.message, "error");
  }
  const sent = await sendInvite(invite.user, invite.token, me);
  revalidatePath("/admin/team");
  toast(sent ? `New invite sent to ${invite.user.email}.` : "The email didn't go — copy the invite link instead.", sent ? "success" : "error");
}

async function toggleActive(formData) {
  "use server";
  await requireOwner();
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  try {
    setUserActive(id, active);
  } catch (err) {
    toast(err.message, "error");
  }
  revalidatePath("/admin/team");
  toast(active ? "User reactivated." : "User deactivated — they can no longer sign in.", "neutral");
}

async function changeRole(formData) {
  "use server";
  await requireOwner();
  const id = Number(formData.get("id"));
  const role = normalizeRole(formData.get("role"));
  try {
    setUserRole(id, role);
  } catch (err) {
    toast(err.message, "error");
  }
  revalidatePath("/admin/team");
  toast(`Role updated to ${role}.`);
}

// No made-up passwords: they get an emailed link to choose a new one.
async function sendResetLink(formData) {
  "use server";
  await requireOwner();
  let r;
  try {
    r = resetLinkFor(Number(formData.get("id")));
  } catch (err) {
    toast(err.message, "error");
  }
  let sent = false;
  try {
    const res = await emailPasswordReset(r.user, `${APP_URL}/admin/reset?token=${r.token}`);
    sent = res?.ok !== false;
  } catch (err) {
    console.error("[team] reset email failed:", err.message);
  }
  revalidatePath("/admin/team");
  toast(sent ? `Reset link sent to ${r.user.email} — it works for an hour.` : "The email didn't go. Try again in a minute.", sent ? "neutral" : "error");
}

export default async function TeamPage() {
  await requireOwner();
  const users = listUsers();
  // The live invite link for anyone still to accept, so it can be copied into
  // a text if the email went astray. Only while it hasn't expired.
  const inviteLinks = Object.fromEntries(
    users
      .filter((u) => u.is_active && isPendingInvite(u))
      .map((u) => [u.id, db.prepare("SELECT reset_token, reset_expires_at FROM admin_users WHERE id = ?").get(u.id)])
      .filter(([, r]) => r?.reset_token && new Date(r.reset_expires_at) > new Date())
      .map(([id, r]) => [id, `${APP_URL}/admin/welcome?token=${r.reset_token}`])
  );

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Admin accounts for The Alley. Owners can add people, change roles, and deactivate access. Removing someone deactivates them (their name stays on past activity) — they're never erased."
      />

      {/* Add user */}
      <Card pad="md" className="mb-6">
        <h2 className="text-lg font-semibold text-ink">Add a team member</h2>
        <p className="mt-1 text-sm text-ink-muted">
          We&apos;ll email them an invite to choose their own password — nobody has to pass one along.
        </p>
        {/* Keyed on the list, so the boxes clear once someone is added. */}
        <form key={users.length} action={addUser} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="label" htmlFor="first_name">First name</label>
            <input id="first_name" name="first_name" required autoComplete="off" className="field" />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" autoComplete="off" className="field" />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="off" className="field" placeholder="name@example.com" />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="role">Role</label>
            <select id="role" name="role" defaultValue="admin" className="field">
              <option value="user">User — view &amp; edit content, can’t approve or charge bookings</option>
              <option value="admin">Admin — manage bookings &amp; content, can’t manage team</option>
              <option value="owner">Owner — everything, including the team</option>
              <option value="staff">Staff — the register rules page only (no admin)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="accent">Send invite</Button>
          </div>
        </form>
      </Card>

      {/* User list */}
      <Card pad="sm">
        <DataTable columns={["Name", "Email", "Role", "Status", "Last login", "Actions"]} minWidth={820}>
          {users.map((u) => {
            const lastOwner = u.role === "owner" && u.is_active && isLastActiveOwner(u.id);
            return (
              <Tr key={u.id} className={u.is_active ? "" : "opacity-55"}>
                <Td className="font-medium text-ink">{u.name || "—"}</Td>
                <Td className="text-ink-soft">{u.email}</Td>
                <Td>
                  <Badge tone={u.role === "owner" ? "sage" : u.role === "admin" ? "sky" : "neutral"}>{u.role}</Badge>
                </Td>
                <Td>
                  {u.is_active && isPendingInvite(u) ? (
                    <Badge tone="warning">invited</Badge>
                  ) : (
                    <Badge tone={u.is_active ? "success" : "danger"}>{u.is_active ? "active" : "deactivated"}</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-muted">
                  {u.last_login_at ? u.last_login_at.slice(0, 10) : "never"}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {/* Change role */}
                    <form action={changeRole} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <select
                        name="role"
                        defaultValue={u.role}
                        disabled={lastOwner}
                        className="rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink disabled:opacity-50"
                        title={lastOwner ? "The last active owner can't be demoted" : "Change role"}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                        <option value="staff">Staff</option>
                      </select>
                      <Button type="submit" variant="ghost" size="sm" disabled={lastOwner}>
                        Set
                      </Button>
                    </form>

                    {u.is_active && isPendingInvite(u) ? (
                      <>
                        <form action={resendInvite}>
                          <input type="hidden" name="id" value={u.id} />
                          <Button type="submit" variant="subtle" size="sm">Resend invite</Button>
                        </form>
                        {inviteLinks[u.id] ? <CopyLink url={inviteLinks[u.id]} label="Copy invite link" /> : null}
                      </>
                    ) : u.is_active ? (
                      <form action={sendResetLink}>
                        <input type="hidden" name="id" value={u.id} />
                        <Button type="submit" variant="subtle" size="sm" title="Emails them a link to choose a new password">
                          Send reset link
                        </Button>
                      </form>
                    ) : null}

                    {/* Activate / deactivate */}
                    <form action={toggleActive}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="active" value={u.is_active ? "0" : "1"} />
                      <Button
                        type="submit"
                        variant={u.is_active ? "danger" : "accent"}
                        size="sm"
                        disabled={u.is_active && lastOwner}
                        title={u.is_active && lastOwner ? "Keep at least one active owner" : undefined}
                      >
                        {u.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </Card>
    </div>
  );
}
