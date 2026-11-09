"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { Button, Icon } from "@/components/atoms";
import { Dropdown, DropdownItem } from "@/components/molecules";
import Image from "next/image";

export interface NavLink {
  label: string;
  href?: string;
  /** Renders this link as a dropdown with these items instead of a plain link. */
  children?: { label: string; href: string }[];
}

export interface NavbarProps {
  logo?: ReactNode;
  links?: NavLink[];
  resourcesItems?: DropdownItem[];
  ctaLabel?: string;
  onCtaClick?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCtaClick?: () => void;
  hasUnreadNotifications?: boolean;
  onNotificationClick?: () => void;
  /** Extra content appended to the mobile menu panel below the primary links (e.g. a "bare" Sidebar). */
  mobileFooter?: ReactNode;
  /** Right-aligned desktop slot (e.g. a profile dropdown) that replaces the CTA buttons when provided. Also suppresses the mobile collapsed-bar CTA. */
  accountMenu?: ReactNode;
  /** Desktop (lg+) button that shrinks the sidebar to a rail / expands it. `open` = full width. Omit when there is no sidebar. */
  sidebarToggle?: { open: boolean; onToggle: () => void };
  /** Renders transparent-over-content and floats above the page, picking up the solid background once the page scrolls. */
  transparent?: boolean;
}

const defaultLinks: NavLink[] = [{ label: "Events", href: "/events" }];

const defaultResourcesItems: DropdownItem[] = [];

/** Header height, in one place — every other measurement below (mobile backdrop
 * offset, mobile panel max-height) is derived from this so they can't drift apart. */
const HEADER_HEIGHT_CLASS = "h-20";
const HEADER_HEIGHT_REM = 5; // matches h-20 (5rem)

function navLinkClass(isActive: boolean) {
  return `text-body focus-visible:ring-offset-primary font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none ${
    isActive
      ? "text-white relative after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:rounded-full after:bg-secondary"
      : "text-white/70 hover:text-white"
  }`;
}

/**
 * Tracks whether `elementId` (the app's scroll container — see `id="app-scroll-region"`
 * in app-shell.tsx) has been scrolled past `threshold`. Only attaches a listener while
 * `enabled` is true, so it's a no-op for every navbar that isn't in transparent mode.
 */
function useScrolledPast(
  elementId: string,
  threshold: number,
  enabled: boolean,
) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const el = document.getElementById(elementId);
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > threshold);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [elementId, threshold, enabled]);

  return scrolled;
}

interface DesktopNavLinksProps {
  links: NavLink[];
  pathname: string;
}

/** The left-side primary links — sits next to the logo, inside the left flex group. */
function DesktopNavLinks({ links, pathname }: DesktopNavLinksProps) {
  return (
    <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
      {links.map((link) => {
        if (link.children) {
          const hasActiveChild = link.children.some(
            (child) => child.href === pathname,
          );
          return (
            <Dropdown
              key={link.label}
              trigger={
                <span
                  className={`flex items-center gap-1 ${navLinkClass(hasActiveChild)}`}
                >
                  {link.label}
                  <Icon icon={ChevronDown} size="sm" />
                </span>
              }
              items={link.children.map((child) => ({
                label: child.label,
                href: child.href,
              }))}
            />
          );
        }
        return (
          <Link
            key={link.label}
            href={link.href ?? "#"}
            aria-current={pathname === link.href ? "page" : undefined}
            className={navLinkClass(pathname === link.href)}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

interface DesktopActionsProps {
  accountMenu?: ReactNode;
  secondaryCtaLabel?: string;
  onSecondaryCtaClick?: () => void;
  ctaLabel: string;
  onCtaClick?: () => void;
}

/** The right-aligned account/CTA area — a sibling of the left group, not nested inside it,
 * so the header's `justify-between` row actually pushes it to the far right. */
function DesktopActions({
  accountMenu,
  secondaryCtaLabel,
  onSecondaryCtaClick,
  ctaLabel,
  onCtaClick,
}: DesktopActionsProps) {
  return (
    <div className="mr-5 hidden items-center gap-3 md:flex">
      {accountMenu ?? (
        <>
          {secondaryCtaLabel && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={onSecondaryCtaClick}
            >
              {secondaryCtaLabel}
            </Button>
          )}
          <Button variant="accent" size="sm" onClick={onCtaClick}>
            {ctaLabel}
          </Button>
        </>
      )}
    </div>
  );
}

interface MobileMenuPanelProps {
  links: NavLink[];
  resourcesItems?: DropdownItem[];
  secondaryCtaLabel?: string;
  onSecondaryCtaClick?: () => void;
  mobileFooter?: ReactNode;
  onClose: () => void;
}

function MobileMenuPanel({
  links,
  resourcesItems,
  secondaryCtaLabel,
  onSecondaryCtaClick,
  mobileFooter,
  onClose,
}: MobileMenuPanelProps) {
  return (
    <>
      <div
        className={`bg-primary/40 fixed inset-x-0 bottom-0 z-30 lg:hidden`}
        style={{ top: `${HEADER_HEIGHT_REM}rem` }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="bg-primary absolute inset-x-0 top-full z-40 overflow-y-auto border-t border-white/10 shadow-lg lg:hidden"
        style={{ maxHeight: `calc(100vh - ${HEADER_HEIGHT_REM}rem)` }}
      >
        <nav aria-label="Primary" className="space-y-1 px-4 py-3">
          {links.map((link) =>
            link.children ? (
              <div key={link.label}>
                <p className="text-small px-2 pt-2 font-semibold tracking-wide text-white/50 uppercase">
                  {link.label}
                </p>
                {link.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={onClose}
                    className="text-body block rounded-sm px-4 py-2 font-medium text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={link.label}
                href={link.href ?? "#"}
                onClick={onClose}
                className="text-body block rounded-sm px-2 py-2 font-medium text-white/80 hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ),
          )}
          {/* {resourcesItems
            .filter(
              (item): item is DropdownItem & { href: string } =>
                !item.divider && !!item.href,
            )
            .map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className="text-body block rounded-sm px-2 py-2 font-medium text-white/80 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))} */}
          {/* {secondaryCtaLabel && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSecondaryCtaClick?.();
              }}
              className="text-body block w-full rounded-sm px-2 py-2 text-left font-medium text-white/80 hover:bg-white/10 hover:text-white"
            >
              {secondaryCtaLabel}
            </button>
          )} */}
        </nav>
        {mobileFooter && (
          <div className="bg-bg-light border-t border-white/10">
            {mobileFooter}
          </div>
        )}
      </div>
    </>
  );
}

export function Navbar({
  logo = (
    <Image
      src={"/app-logo.png"}
      width={100}
      height={20}
      alt="logo"
      className="mb-2z mt-2 object-contain"
    />
  ),
  links = defaultLinks,
  resourcesItems = defaultResourcesItems,
  ctaLabel,
  onCtaClick,
  secondaryCtaLabel,
  onSecondaryCtaClick,
  hasUnreadNotifications = false,
  onNotificationClick,
  mobileFooter,
  accountMenu,
  sidebarToggle,
  transparent = false,
}: NavbarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrolled = useScrolledPast("app-scroll-region", 8, transparent);

  const headerClass = transparent
    ? `fixed inset-x-0 top-0 ${scrolled ? "bg-primary/85 shadow-md backdrop-blur-xl backdrop-saturate-150" : "bg-transparent shadow-none"}`
    : "bg-primary relative shadow-sm";

  return (
    <header className={`z-20 transition-colors duration-300 ${headerClass}`}>
      <div
        className={`mx-4 flex items-center justify-between gap-4 ${HEADER_HEIGHT_CLASS}`}
      >
        <div className="flex items-center gap-8">
          {sidebarToggle && (
            <button
              type="button"
              onClick={sidebarToggle.onToggle}
              aria-label={
                sidebarToggle.open ? "Collapse sidebar" : "Expand sidebar"
              }
              aria-expanded={sidebarToggle.open}
              className="focus-visible:ring-offset-primary -mr-4 hidden rounded-sm p-2 text-white/80 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none lg:block"
            >
              <Icon
                icon={sidebarToggle.open ? PanelLeftClose : PanelLeftOpen}
                size="md"
              />
            </button>
          )}
          <Link href="/">{logo}</Link>
          <DesktopNavLinks links={links} pathname={pathname} />
        </div>

        {/* <DesktopActions
          accountMenu={accountMenu}
          secondaryCtaLabel={secondaryCtaLabel}
          onSecondaryCtaClick={onSecondaryCtaClick}
          ctaLabel={ctaLabel}
          onCtaClick={onCtaClick}
        /> */}

        <div className="flex items-center gap-2 lg:hidden">
          {/* <button
            type="button"
            onClick={onNotificationClick}
            aria-label="Notifications"
            className="focus-visible:ring-offset-primary relative rounded-sm p-2 text-white/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Icon icon={Bell} size="sm" />
            {hasUnreadNotifications && (
              <span className="bg-danger absolute top-1.5 right-1.5 size-2 rounded-full" />
            )}
          </button> */}
          {/* {!accountMenu && (
            <Button variant="accent" size="sm" onClick={onCtaClick}>
              {ctaLabel}
            </Button>
          )} */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="focus-visible:ring-offset-primary rounded-sm p-2 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Icon icon={mobileOpen ? X : Menu} size="md" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <MobileMenuPanel
          links={links}
          resourcesItems={resourcesItems}
          // secondaryCtaLabel={secondaryCtaLabel}
          // onSecondaryCtaClick={onSecondaryCtaClick}
          mobileFooter={mobileFooter}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}
