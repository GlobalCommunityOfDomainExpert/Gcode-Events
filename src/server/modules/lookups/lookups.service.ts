import "server-only";
import {
  toCategory,
  toEventMode,
  toEventStatus,
  toEventType,
} from "./lookups.mapper";
import { lookupsRepository } from "./lookups.repository";
import type { LookupKind, Lookups } from "./lookups.schemas";

// Reference data. Callable directly from server components (no HTTP hop)
// as well as from the /api/v1/lookups routes.
export const lookupsService = {
  async eventTypes() {
    return (await lookupsRepository.eventTypes()).map(toEventType);
  },
  async statuses() {
    return (await lookupsRepository.statuses()).map(toEventStatus);
  },
  async modes() {
    return (await lookupsRepository.modes()).map(toEventMode);
  },
  async categories() {
    return (await lookupsRepository.categories()).map(toCategory);
  },

  async all(): Promise<Lookups> {
    const [eventTypes, statuses, modes, categories] = await Promise.all([
      this.eventTypes(),
      this.statuses(),
      this.modes(),
      this.categories(),
    ]);
    return { eventTypes, statuses, modes, categories };
  },

  byKind(kind: LookupKind) {
    switch (kind) {
      case "event-types":
        return this.eventTypes();
      case "statuses":
        return this.statuses();
      case "modes":
        return this.modes();
      case "categories":
        return this.categories();
    }
  },
};
