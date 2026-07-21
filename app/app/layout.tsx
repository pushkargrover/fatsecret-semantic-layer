import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The LLM never touches the data",
  description:
    "A governed semantic layer for nutrition data. The LLM selects a metric; it never writes SQL, never sees raw tables, and refuses when no metric fits.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
