import type { Metadata } from "next";
import { Hind_Siliguri, Inter, Manrope } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Stitch design system typography: Manrope for headlines, Inter for body/label, Hind Siliguri for Bangla.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali"],
  weight: ["300", "400", "600"],
  variable: "--font-bangla-family",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Okkhor | The Illuminated Archive",
  description: "Bangla-first research learning platform with scholar onboarding, community discussion, and premium archive discovery.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      className={`${manrope.variable} ${inter.variable} ${hindSiliguri.variable}`}
      lang="en"
    >
      <body>{children}</body>
    </html>
  );
}
