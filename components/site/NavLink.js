import Link from "next/link";

/**
 * A site nav link that renders a plain external anchor (new tab) when the item
 * is flagged `external`, and a Next <Link> for internal routes otherwise. Lets
 * the shared NAV/FOOTER config point an item at another website (e.g. Art Beat
 * → centerstreetartbeat.com) without special-casing every render site.
 */
export default function NavLink({ href, external, className, children, ...rest }) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
