import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Backdrop, Nav } from "@/components/ui";
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
  title: "Motor Fault Detector",
  description: "AI-based motor fault detection using analog current sensing",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Backdrop />
        <Nav />
        {children}
        <footer className="mt-auto border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-5 text-xs text-ink-2 sm:px-6">
            <span>Analog Electronics project · AI motor fault detection</span>
            <span>
              Data source: simulated Arduino Uno (Python model of the analog chain) ·{" "}
              <a href="/vigil" className="underline decoration-line underline-offset-2 hover:text-ink">Embedded firmware suite (Vigil)</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
