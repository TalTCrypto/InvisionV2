import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { TRPCReactProvider } from "~/trpc/react";
import { ThemeToggle } from "~/components/ui/theme-toggle";

export const metadata: Metadata = {
  title: "InVision - Collaborez avec des Agents IA",
  description:
    "Créez des workflows d'intelligence artificielle personnalisés, collaborez avec votre équipe, et connectez-vous aux plateformes que vous utilisez déjà.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${geist.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCReactProvider>
            {children}
            <ThemeToggle />
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
