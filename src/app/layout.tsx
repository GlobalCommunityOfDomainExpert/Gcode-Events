import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://events.gcode.in"),
  title: "GCODE Events – Community Tech Events Platform",
  description:
    "Discover hackathons, ideathons, AMAs, and webinars hosted by the GCODE developer community. Explore, register, and connect.",
  openGraph: {
    title: "GCODE Events – Community Tech Events Platform",
    description:
      "Discover hackathons, ideathons, AMAs, and webinars hosted by the GCODE developer community.",
    url: "https://events.gcode.in",
    siteName: "GCODE Events",
    images: [{ url: "/banner-hero.png", width: 1735, height: 566 }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GCODE Events – Community Tech Events Platform",
    description:
      "Discover hackathons, ideathons, AMAs, and webinars hosted by the GCODE developer community.",
    images: ["/banner-hero.png"],
  },
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
        {modal}
      </body>
    </html>
  );
}
