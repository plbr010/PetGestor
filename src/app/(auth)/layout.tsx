import type { Metadata } from "next";

import { technicalAuthRobots } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  robots: technicalAuthRobots,
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
