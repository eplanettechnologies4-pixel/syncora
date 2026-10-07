import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shopify CRM",
  description: "Shopify CRM & ERP Management Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#090d16] text-slate-100">
        {children}
      </body>
    </html>
  );
}
