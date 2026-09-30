import { Fragment } from "react";
import { Link } from "@/components/atoms";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="text-small flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={item.label}>
              <li className="min-w-0 max-w-[28vw] shrink sm:max-w-48">
                {item.href && !isLast ? (
                  <Link href={item.href} variant="secondary" size="sm">
                    <span className="block truncate" title={item.label}>
                      {item.label}
                    </span>
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    title={item.label}
                    className="text-text-primary block truncate font-medium"
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li aria-hidden="true" className="text-text-secondary shrink-0">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
