import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Ancestry Map",
  description:
    "A real-time ethical audit of Large Language Model infrastructure — tracing your prompt across territories, water tables, and mineral sources.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
