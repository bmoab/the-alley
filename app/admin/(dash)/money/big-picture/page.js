import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager, getActor } from "@/lib/auth.js";
import { MONTH_RE, bigPicture, monthLabel, savePersonal, thisMonth } from "@/lib/money.js";
import { shiftDate } from "@/lib/constants.js";
import PageHeader from "@/components/admin/ui/PageHeader.js";
import Button from "@/components/admin/ui/Button.js";
import BigPicture from "@/components/admin/money/BigPicture.js";

export const metadata = { title: "Big picture" };
export const dynamic = "force-dynamic";

const PATH = "/admin/money/big-picture";
const addMonths = (m, n) => shiftDate(`${m}-01`, { months: n }).slice(0, 7);

async function savePersonalAction(formData) {
  "use server";
  await requireStaffManager();
  const { actorName } = await getActor();
  const n = String(formData.get("n") || "");
  const months = String(formData.get("months") || "").split(",").filter((m) => MONTH_RE.test(m));
  const to = (toast, toastType = "success") => redirect(`${PATH}?${new URLSearchParams({ ...(n ? { n } : {}), toast, toastType })}`);
  try {
    for (const m of months) savePersonal(m, { amount: formData.get(`personal_${m}`), note: formData.get(`note_${m}`), by: actorName });
  } catch (err) {
    to(err.message, "error");
  }
  revalidatePath(PATH);
  to("Saved what was paid personally.");
}

export default async function BigPicturePage({ searchParams }) {
  await requireStaffManager();
  // The last N full months (this month is still going, so it'd look small).
  const n = [3, 4, 6, 12].includes(Number(searchParams?.n)) ? Number(searchParams.n) : 4;
  const last = addMonths(thisMonth(), -1);
  const months = Array.from({ length: n }, (_, i) => addMonths(last, i - (n - 1)));
  const rows = await bigPicture(months);

  return (
    <div>
      <PageHeader
        title="Big picture"
        subtitle={`An average month from ${monthLabel(months[0])} to ${monthLabel(last)}, what that means over a year, and what would change it. Every number in the average can be changed to try things — nothing here changes the books except what's saved as paid personally.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {[3, 4, 6, 12].map((k) => (
              <Button key={k} href={`${PATH}?n=${k}`} size="sm" variant={k === n ? "primary" : "ghost"}>
                {k} months
              </Button>
            ))}
            <Button href="/admin/money" size="sm" variant="subtle">
              Money
            </Button>
          </div>
        }
      />
      <BigPicture rows={rows} n={n} saveAction={savePersonalAction} />
    </div>
  );
}
