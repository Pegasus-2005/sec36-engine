import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "e-Maap 2.0 | National Legal Metrology Surveillance Portal | Government of India",
  description: "Official Section 36 Enforcement & Automated Verification Engine under the Legal Metrology Act, 2009 and Packaged Commodities Rules, 2011. Department of Consumer Affairs, Ministry of Consumer Affairs, Food & Public Distribution, Government of India.",
  keywords: [
    "Legal Metrology Act 2009",
    "Packaged Commodities Rules 2011",
    "Section 36 Enforcement",
    "e-Maap Portal",
    "Department of Consumer Affairs",
    "Government of India",
    "NIC UXDT"
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
