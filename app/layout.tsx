import type { Metadata, Viewport } from "next";
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
  title: {
    default: "GyroPlay — Phone Gyroscope Arcade | Free Browser Games",
    template: "%s | GyroPlay",
  },
  description:
    "Turn your phone into a game controller. Play 10 free arcade games using your phone's gyroscope — no downloads, no installs. Tilt, shake, and tap to play instantly in your browser.",
  keywords: [
    "gyroscope games",
    "phone controller",
    "browser arcade",
    "tilt games",
    "free web games",
    "mobile gyroscope",
    "multiplayer browser games",
    "no download games",
    "phone as controller",
    "motion control games",
  ],
  authors: [{ name: "GyroPlay" }],
  creator: "GyroPlay",
  openGraph: {
    title: "GyroPlay — Phone Gyroscope Arcade",
    description:
      "Turn your phone into a game controller. 10 free arcade games playable with just your phone's gyroscope — no downloads needed.",
    type: "website",
    siteName: "GyroPlay",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "GyroPlay — Phone Gyroscope Arcade",
    description:
      "Turn your phone into a game controller. 10 free arcade games with gyroscope controls — zero installs.",
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "GyroPlay",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#060918",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
