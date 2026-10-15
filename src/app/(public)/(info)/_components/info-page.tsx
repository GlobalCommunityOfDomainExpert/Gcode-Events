import { Fragment, ReactNode } from "react";
import Link from "next/link";

// A block is a paragraph (string) or a bulleted list (string[]).
// Strings support inline links written as [text](href).
export type InfoBlock = string | string[];

export interface InfoSection {
  heading?: string;
  blocks: InfoBlock[];
}

export interface InfoPageProps {
  title: string;
  lastUpdated?: string;
  sections: InfoSection[];
  children?: ReactNode;
}

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const [full, label, href] = match;
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const className =
      "text-primary hover:text-primary-hover font-medium underline";
    parts.push(
      /^(https?:|mailto:)/.test(href) ? (
        <a key={match.index} href={href} className={className}>
          {label}
        </a>
      ) : (
        <Link key={match.index} href={href} className={className}>
          {label}
        </Link>
      ),
    );
    cursor = match.index + full.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

export function InfoPage({
  title,
  lastUpdated,
  sections,
  children,
}: InfoPageProps) {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-6 space-y-1">
        <h1 className="text-display text-text-primary font-extrabold">
          {title}
        </h1>
        {lastUpdated && (
          <p className="text-small text-text-secondary">
            Last Updated: {lastUpdated}
          </p>
        )}
      </header>

      <div className="border-border-light bg-surface-light space-y-8 rounded-md border p-6 sm:p-8">
        {sections.map((section, i) => (
          <section key={section.heading ?? i} className="space-y-3">
            {section.heading && (
              <h2 className="text-large text-text-primary font-bold">
                {section.heading}
              </h2>
            )}
            {section.blocks.map((block, j) =>
              Array.isArray(block) ? (
                <ul
                  key={j}
                  className="text-body text-text-secondary list-disc space-y-1.5 pl-5"
                >
                  {block.map((item) => (
                    <li key={item}>
                      <RichText text={item} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={j} className="text-body text-text-secondary">
                  <RichText text={block} />
                </p>
              ),
            )}
          </section>
        ))}
        {children}
      </div>
    </article>
  );
}
