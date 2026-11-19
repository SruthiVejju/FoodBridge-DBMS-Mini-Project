import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FoodBridge | Food Waste Redistribution",
  description: "Food Waste Redistribution and Resource Allocation System — donors and NGOs",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
