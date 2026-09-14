import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";

import { MetaPixelRoot } from "@/components/analytics/meta-pixel-root";
import { brand } from "@/config/brand";
import { getMetadataBase } from "@/lib/seo/metadata-base";
import { publicIndexRobots } from "@/lib/seo/robots-policy";

import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: brand.defaultTitle,
    template: `%s | ${brand.name}`,
  },
  description: brand.defaultDescription,
  applicationName: brand.name,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: brand.name,
    title: brand.defaultTitle,
    description: brand.defaultDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: brand.defaultTitle,
    description: brand.defaultDescription,
  },
  robots: publicIndexRobots,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f8a70",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={brand.locale}
      className={`${plusJakarta.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <MetaPixelRoot />
        {children}
      </body>
    </html>
  );
}
