import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CF ServiceOps",
  description: "Classic Fireplace internal service operations control center"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
