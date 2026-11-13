import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "Try Fieldwork on your own keys: one agent, eight web providers, every call and its cost in view.",
  title: "Fieldwork Playground",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en-GB">
    <body>{children}</body>
  </html>
);

export default RootLayout;
