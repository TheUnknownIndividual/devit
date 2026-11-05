import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { appOrigin, BRAND, DESCRIPTION, KEYWORDS, TAGLINE } from "@/lib/seo";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin()),
  title: `${BRAND} · ${TAGLINE}`,
  description: "Describe your token in one sentence. Get a live website with wallet, swap and buys from any chain.",
  applicationName: BRAND,
  keywords: KEYWORDS,
  category: "technology",
  creator: BRAND,
  publisher: BRAND,
  openGraph: { type: "website", siteName: BRAND, title: `${BRAND} · ${TAGLINE}`, description: DESCRIPTION, url: "/", images: [{ url: "/og", width: 1200, height: 630, alt: `${BRAND}: ${TAGLINE}` }], locale: "en_US" },
  twitter: { card: "summary_large_image", title: `${BRAND} · ${TAGLINE}`, description: DESCRIPTION, images: ["/og"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  alternates: { types: { "text/plain": "/llms.txt" } },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans">
        {children}
        <Script src="/ga.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
