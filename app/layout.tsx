import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUNI HUD",
  description: "AR transit overlay for SF MUNI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
