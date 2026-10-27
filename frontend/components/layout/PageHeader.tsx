import { Crumb, Breadcrumbs } from "./Breadcrumbs";

export function PageHeader({
  breadcrumbs,
  title,
  description,
  action,
  maxWidth = "max-w-5xl",
}: {
  breadcrumbs?: Crumb[];
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Tailwind max-width class — must match the page body's own wrapper
   * below, or the header and body won't share the same left/right edges
   * and the page reads as off-center instead of a single aligned column. */
  maxWidth?: string;
}) {
  return (
    <div className="border-b border-line bg-surface px-6 py-5 sm:px-8">
      <div className={`mx-auto w-full ${maxWidth}`}>
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
        <div className={`flex items-start justify-between gap-4 ${breadcrumbs?.length ? "mt-1.5" : ""}`}>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}
