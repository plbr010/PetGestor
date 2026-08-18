"use client";

import { filterNavItemsByMembership } from "@/lib/auth/nav-filter";
import { useDashboardUser } from "@/components/layout/dashboard-user-provider";
import type { DashboardNavItem } from "@/config/navigation";

export function useFilteredDashboardNav(): DashboardNavItem[] {
  const { membership, isPlatformAdmin } = useDashboardUser();

  if (isPlatformAdmin) {
    return filterNavItemsByMembership(membership, { bypass: true });
  }

  return filterNavItemsByMembership(membership);
}
