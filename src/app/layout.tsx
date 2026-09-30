import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Records Slice",
  description: "Owned records, access control and audited deletion",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
