import Card from "@/components/admin/ui/Card.js";

/** Shown in the staff area to a login that isn't linked to an employee yet. */
export default function NotSetUp() {
  return (
    <Card pad="lg">
      <h1 className="text-xl font-semibold text-ink">You&apos;re signed in</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Your login isn&apos;t connected to a spot on the schedule yet. Ask your manager to add you under Employees
        with this same email address, then refresh this page.
      </p>
    </Card>
  );
}
