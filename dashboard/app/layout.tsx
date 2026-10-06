import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Backdrop, Footer, Nav } from "@/components/ui";
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
  title: "AI-Based Motor Fault Detection",
  description: "AI-based motor fault detection using analog current sensing: a 0.1 Ω shunt, an LM358 differential amplifier and Sallen-Key filter, an Arduino ADC and a Random Forest. Analog Electronics, semester 3.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Backdrop />
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
