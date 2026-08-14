import type { CompanyRole } from "@/types/database.types";

export type AuthUser = {
  id: string;
  email: string | null;
};

export type UserProfile = {
  fullName: string;
  avatarUrl: string | null;
  onboardingTutorialCompletedAt: string | null;
};

export type CompanySummary = {
  id: string;
  name: string;
  timezone: string;
};

export type CompanyMembership = {
  role: CompanyRole;
  company: CompanySummary;
};

export type UserContext = {
  user: AuthUser;
  profile: UserProfile | null;
  membership: CompanyMembership | null;
};

export type DashboardContext = UserContext & {
  profile: UserProfile;
  membership: CompanyMembership;
};
