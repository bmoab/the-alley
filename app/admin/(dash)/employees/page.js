import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireStaffManager,
  getCurrentUser,
  canManageStaff,
  getActor,
  createUser,
  getUserByEmail,
  getUserById,
  generateTempPassword,
  resetUserPasswordToTemp,
  setUserActive,
} from "@/lib/auth.js";
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  setEmployeeActive,
  linkEmployeeLogin,
  EMPLOYEE_COLORS,
} from "@/lib/staff.js";
import { logActivity } from "@/lib/activity.js";
import { formatDate } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Card from "@/components/admin/ui/Card.js";
import Badge from "@/components/admin/ui/Badge.js";
import Button from "@/components/admin/ui/Button.js";

export const metadata = { title: "Employees" };
export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL || "";

function done(message, type = "success", extra = "") {
  revalidatePath("/admin/employees");
  revalidatePath("/admin/schedule");
  redirect(`/admin/employees?toast=${encodeURIComponent(message)}&toastType=${type}${extra}`);
}

function field(formData, key) {
  const v = formData.get(key);
  return v == null ? undefined : v.toString();
}

/**
 * Give an employee a sign-in. If their email already belongs to an account (an
 * owner or admin who also works shifts), that account is linked rather than a
 * second one made — they reach their shifts from the same login.
 */
function attachLogin(employee, me) {
  if (!employee.email) throw new Error("Add an email address first — it's their sign-in.");
  const existing = getUserByEmail(employee.email);
  if (existing) {
    linkEmployeeLogin(employee.id, existing.id);
    if (!existing.is_active && existing.role === "staff") setUserActive(existing.id, true);
    return { temp: null, linkedExisting: existing.role !== "staff" };
  }
  const temp = generateTempPassword();
  const userId = createUser({
    name: employee.name,
    email: employee.email,
    role: "staff",
    password: temp,
    createdBy: me.id,
  });
  linkEmployeeLogin(employee.id, userId);
  return { temp, linkedExisting: false };
}

async function addEmployee(formData) {
  "use server";
  const me = await requireStaffManager();
  let employee;
  try {
    employee = createEmployee({
      name: field(formData, "name"),
      email: field(formData, "email"),
      phone: field(formData, "phone"),
      color: field(formData, "color"),
      hire_date: field(formData, "hire_date"),
      notes: field(formData, "notes"),
    });
  } catch (err) {
    done(err.message, "error");
  }
  logActivity({
    eventType: "employee_added",
    description: `Added ${employee.name} to the staff list`,
    ...(await getActor()),
  });
  if (formData.get("make_login") != null) {
    let result;
    try {
      result = attachLogin(employee, me);
    } catch (err) {
      done(`${employee.name} added, but no login yet: ${err.message}`, "error");
    }
    logActivity({
      eventType: "staff_login_created",
      description: `Sign-in set up for ${employee.name}`,
      ...(await getActor()),
    });
    if (result.temp) {
      done(`${employee.name} added with a login.`, "success", `&login=${employee.id}&pw=${encodeURIComponent(result.temp)}`);
    }
  }
  done(`${employee.name} added.`);
}

async function saveEmployee(formData) {
  "use server";
  await requireStaffManager();
  const id = Number(formData.get("id"));
  let after;
  try {
    after = updateEmployee(id, {
      name: field(formData, "name"),
      email: field(formData, "email"),
      phone: field(formData, "phone"),
      color: field(formData, "color"),
      hire_date: field(formData, "hire_date"),
      notes: field(formData, "notes"),
    });
  } catch (err) {
    done(err.message, "error");
  }
  logActivity({
    eventType: "employee_updated",
    description: `Updated ${after.name}'s details`,
    metadata: { employeeId: id },
    ...(await getActor()),
  });
  done(`${after.name} saved.`);
}

async function giveLogin(formData) {
  "use server";
  const me = await requireStaffManager();
  const employee = getEmployee(Number(formData.get("id")));
  if (!employee) done("That employee no longer exists.", "error");
  let result;
  try {
    result = attachLogin(employee, me);
  } catch (err) {
    done(err.message, "error");
  }
  logActivity({
    eventType: "staff_login_created",
    description: `Sign-in set up for ${employee.name}`,
    ...(await getActor()),
  });
  if (result.temp) {
    done(`Login created for ${employee.name}.`, "success", `&login=${employee.id}&pw=${encodeURIComponent(result.temp)}`);
  }
  done(
    result.linkedExisting
      ? `${employee.name} already signs in to the admin — their shifts are now under "My shifts".`
      : `${employee.name}'s login is linked.`
  );
}

async function resetLogin(formData) {
  "use server";
  await requireStaffManager();
  const employee = getEmployee(Number(formData.get("id")));
  if (!employee?.admin_user_id) done("They don't have a login yet.", "error");
  // Here a manager may reset a STAFF login only — an admin's or owner's account is Team's business.
  const login = getUserById(employee.admin_user_id);
  if (login?.role !== "staff") done("That's an admin sign-in — reset it from Team.", "error");
  const temp = resetUserPasswordToTemp(employee.admin_user_id);
  done(`New temporary password for ${employee.name}.`, "success", `&login=${employee.id}&pw=${encodeURIComponent(temp)}`);
}

async function toggleEmployee(formData) {
  "use server";
  await requireStaffManager();
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  const employee = getEmployee(id);
  if (!employee) done("That employee no longer exists.", "error");
  const reopened = setEmployeeActive(id, active);
  // Their staff login goes with them (an admin/owner login is left alone).
  if (employee.admin_user_id) {
    const login = getUserById(employee.admin_user_id);
    if (login?.role === "staff") setUserActive(login.id, active);
  }
  logActivity({
    eventType: active ? "employee_reactivated" : "employee_deactivated",
    description: active
      ? `${employee.name} is back on the staff list`
      : `${employee.name} deactivated${reopened ? ` · ${reopened} future shift${reopened === 1 ? "" : "s"} now open` : ""}`,
    ...(await getActor()),
  });
  done(
    active
      ? `${employee.name} reactivated.`
      : `${employee.name} deactivated${reopened ? ` — ${reopened} upcoming shift${reopened === 1 ? " is" : "s are"} now open` : ""}.`,
    "neutral"
  );
}

function ColorPicker({ value }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EMPLOYEE_COLORS.map((c) => (
        <label key={c} className="cursor-pointer">
          <input type="radio" name="color" value={c} defaultChecked={value === c} className="peer sr-only" />
          <span
            className="block h-7 w-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink"
            style={{ background: c }}
          />
        </label>
      ))}
    </div>
  );
}

function EmployeeFields({ employee = {} }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="label">Name</label>
        <input name="name" required defaultValue={employee.name || ""} className="field" placeholder="Full name" />
      </div>
      <div>
        <label className="label">Email (their sign-in)</label>
        <input name="email" type="email" defaultValue={employee.email || ""} className="field" placeholder="name@example.com" />
      </div>
      <div>
        <label className="label">Phone</label>
        <input name="phone" type="tel" defaultValue={employee.phone || ""} className="field" />
      </div>
      <div>
        <label className="label">Start date</label>
        <input name="hire_date" type="date" defaultValue={employee.hire_date || ""} className="field" />
      </div>
      <div>
        <label className="label">Colour on the schedule</label>
        <ColorPicker value={employee.color} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Notes</label>
        <input name="notes" defaultValue={employee.notes || ""} className="field" placeholder="Availability, anything worth remembering" />
      </div>
    </div>
  );
}

function loginState(e) {
  if (!e.admin_user_id) return { tone: "neutral", label: "No login" };
  if (!e.login_active) return { tone: "danger", label: "Login off" };
  if (e.login_role && e.login_role !== "staff") return { tone: "sage", label: `Signs in as ${e.login_role}` };
  if (!e.login_last_at) return { tone: "warning", label: "Not signed in yet" };
  return { tone: "success", label: "Has login" };
}

export default async function EmployeesPage({ searchParams }) {
  const me = await getCurrentUser();
  if (!canManageStaff(me)) redirect("/admin");
  const all = listEmployees({ includeInactive: true });
  const active = all.filter((e) => e.is_active);
  const inactive = all.filter((e) => !e.is_active);

  const loginFor = searchParams?.login ? all.find((e) => e.id === Number(searchParams.login)) : null;
  const tempPw = searchParams?.pw;

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Everyone who can be put on the schedule. Give someone a login and they can see their shifts and the schedule at /staff — nothing else. Pay, hours and clocking in are in Square (Square Payroll and Square's timecards)."
      />

      {loginFor && tempPw ? (
        <Card pad="md" className="mb-6 border-verde-deep/40 bg-verde/30">
          <p className="font-semibold text-ink">Sign-in for {loginFor.name}</p>
          <p className="mt-1 text-sm text-ink-soft">
            Send them these — they&apos;ll pick their own password the first time they sign in.
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-ink-muted">Address</dt>
            <dd className="break-all font-mono text-ink">{APP_URL || ""}/admin/login</dd>
            <dt className="text-ink-muted">Email</dt>
            <dd className="font-mono text-ink">{loginFor.email}</dd>
            <dt className="text-ink-muted">Temporary password</dt>
            <dd className="font-mono text-ink">{tempPw}</dd>
          </dl>
          <p className="mt-3 text-xs text-ink-muted">This won&apos;t be shown again once you leave the page.</p>
        </Card>
      ) : null}

      <details className="card mb-6 p-5" open={active.length === 0}>
        <summary className="cursor-pointer font-semibold text-ink">+ Add an employee</summary>
        <form action={addEmployee} className="mt-4">
          <EmployeeFields />
          <label className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="make_login" defaultChecked />
            Create a login for them now (needs their email)
          </label>
          <Button type="submit" variant="accent" className="mt-4">Add employee</Button>
        </form>
      </details>

      {active.length === 0 ? (
        <p className="text-sm text-ink-muted">No employees yet.</p>
      ) : (
        <div className="space-y-3">
          {active.map((e) => {
            const state = loginState(e);
            return (
              <details key={e.id} id={`emp-${e.id}`} className="card p-5">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: e.color || "#5b6770" }} />
                  <span className="font-semibold text-ink">{e.name}</span>
                  <Badge tone={state.tone}>{state.label}</Badge>
                  {e.hire_date ? <span className="ml-auto text-xs text-ink-muted">since {formatDate(e.hire_date)}</span> : null}
                </summary>

                <form action={saveEmployee} className="mt-4">
                  <input type="hidden" name="id" value={e.id} />
                  <EmployeeFields employee={e} />
                  <Button type="submit" className="mt-4">Save</Button>
                </form>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  {!e.admin_user_id || !e.login_active ? (
                    <form action={giveLogin}>
                      <input type="hidden" name="id" value={e.id} />
                      <Button type="submit" variant="accent" size="sm">
                        {e.admin_user_id ? "Turn login back on" : "Create login"}
                      </Button>
                    </form>
                  ) : (
                    <form action={resetLogin}>
                      <input type="hidden" name="id" value={e.id} />
                      <Button type="submit" variant="subtle" size="sm">New temporary password</Button>
                    </form>
                  )}
                  <form action={toggleEmployee}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="active" value="0" />
                    <Button type="submit" variant="danger" size="sm">Deactivate</Button>
                  </form>
                  <span className="text-xs text-ink-muted">
                    Deactivating turns off their login and opens up their future shifts.
                  </span>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {inactive.length ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
            Former employees ({inactive.length})
          </summary>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-paper">
            {inactive.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-ink-soft">
                  {e.name}
                  {e.end_date ? <span className="text-ink-muted"> · left {formatDate(e.end_date)}</span> : null}
                </span>
                <form action={toggleEmployee}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="active" value="1" />
                  <Button type="submit" variant="ghost" size="sm">Reactivate</Button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
