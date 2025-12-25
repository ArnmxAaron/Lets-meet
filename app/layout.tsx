import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Client Components
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";
import InstallButton from "./components/InstallButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Let's Meet",
  description: "Student networking platform",
  // No manifest link here - handled by app/manifest.ts
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Let's Meet",
  },
  icons: {
    icon: "https://cdn-icons-png.flaticon.com/512/5836/5836611.png",
    apple: "https://cdn-icons-png.flaticon.com/512/5836/5836611.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" 
          crossOrigin="anonymous" 
          referrerPolicy="no-referrer" 
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased overscroll-none`}>
        <ServiceWorkerRegistration />
        {children}
        <InstallButton />
      </body>
    </html>
  );
}