import { dashboardNavItems, type DashboardNavItem } from "@/config/navigation";
import { hasPermission, type MembershipAccess } from "@/lib/auth/permissions";
import { navItemRequiresPermission } from "@/lib/auth/route-permissions";

type FilterOptions = {
  bypass?: boolean;
};

export function filterNavItemsByMembership(
  membership: MembershipAccess,
  options: FilterOptions = {},
): DashboardNavItem[] {
  if (options.bypass) {
    return dashboardNavItems;
  }

  return dashboardNavItems.filter((item) => {
    const permission = navItemRequiresPermission(item.href);

    if (!permission) {
      return true;
    }

    return hasPermission(membership, permission);
  });
}

export function canAccessNavHref(membership: MembershipAccess, href: string): boolean {
  const permission = navItemRequiresPermission(href);

  if (!permission) {
    return true;
  }

  return hasPermission(membership, permission);
}
