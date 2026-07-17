import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getCurrentUser,
  listUsers,
  createUser,
  setUserActive,
  setUserRole,
  resetUserPasswordToTemp,
  isLastActiveOwner,
  normalizeRole,
} from "@/lib/auth.js";
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
  await requireOwner();
  const name = (formData.get("name") || "").toString().trim();
  const email = (formData.get("email") || "").toString().trim();
  const role = normalizeRole(formData.get("role"));
  const typed = (formData.get("password") || "").toString().trim();
  const me = await getCurrentUser();
  try {
    createUser({ name, email, role, password: typed || undefined, createdBy: me.id });
  } catch (err) {
    toast(err.message || "Could not add that user.", "error");
  }
  revalidatePath("/admin/team");
  toast(
    typed
      ? `${name || email} added. They'll set their own password on first login.`
      : `${name || email} added. Have them use "Forgot password" at ${APP_URL}/admin/login to set their password (or set one when adding).`
  );
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

async function resetPassword(formData) {
  "use server";
  await requireOwner();
  const id = Number(formData.get("id"));
  const temp = resetUserPasswordToTemp(id);
  revalidatePath("/admin/team");
  toast(`Temporary password set: ${temp} — share it with them. They'll change it on next login.`);
}

export default async function TeamPage() {
  await requireOwner();
  const users = listUsers();

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Admin accounts for The Alley. Owners can add people, change roles, and deactivate access. Removing someone deactivates them (their name stays on past activity) — they're never erased."
      />

      {/* Add user */}
      <Card pad="md" className="mb-6">
        <h2 className="text-lg font-semibold text-ink">Add a team member</h2>
        <form action={addUser} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" required className="field" placeholder="Full name" />
          </div>
          <div>
            <label className="label" htmlFor="email">Email (login)</label>
            <input id="email" name="email" type="email" required className="field" placeholder="name@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="role">Role</label>
            <select id="role" name="role" defaultValue="admin" className="field">
              <option value="user">User — view &amp; edit content, can’t approve or charge bookings</option>
              <option value="admin">Admin — manage bookings &amp; content, can’t manage team</option>
              <option value="owner">Owner — everything, including the team</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="password">Initial password (optional)</label>
            <input id="password" name="password" className="field" placeholder="Leave blank to let them reset it" />
            <p className="mt-1 text-xs text-ink-muted">
              They must change it on first login either way.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="accent">Add member</Button>
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
                  <Badge tone={u.is_active ? "success" : "danger"}>
                    {u.is_active ? "active" : "deactivated"}
                  </Badge>
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
                      </select>
                      <Button type="submit" variant="ghost" size="sm" disabled={lastOwner}>
                        Set
                      </Button>
                    </form>

                    {/* Reset password */}
                    <form action={resetPassword}>
                      <input type="hidden" name="id" value={u.id} />
                      <Button type="submit" variant="subtle" size="sm">Reset pw</Button>
                    </form>

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
