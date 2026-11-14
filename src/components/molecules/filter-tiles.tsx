"use client";

export interface FilterTile {
  value: string;
  label: string;
  count: number;
  /** Highlights the count when something needs the organizer's attention. */
  attention?: boolean;
}

export interface FilterTilesProps {
  tiles: FilterTile[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Stat tiles that double as filters: the number tells you what's there, the
 * click narrows the list. One row replaces a tab bar + a chip row.
 */
export function FilterTiles({ tiles, value, onChange }: FilterTilesProps) {
  return (
    <div
      role="radiogroup"
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] sm:overflow-visible sm:px-0"
    >
      {tiles.map((tile) => {
        const active = tile.value === value;
        return (
          <button
            key={tile.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(tile.value)}
            className={`focus-visible:ring-primary min-w-28 shrink-0 rounded-md border px-4 py-3 text-left transition-colors hover:cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${
              active
                ? "border-primary bg-primary-light"
                : "border-border-light bg-surface-light hover:border-border-hover"
            }`}
          >
            <span
              className={`text-heading block leading-none font-extrabold tabular-nums ${
                tile.attention && tile.count > 0
                  ? "text-secondary"
                  : active
                    ? "text-primary"
                    : "text-text-primary"
              }`}
            >
              {tile.count}
            </span>
            <span
              className={`text-small mt-1 block font-medium ${
                active ? "text-primary" : "text-text-secondary"
              }`}
            >
              {tile.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
