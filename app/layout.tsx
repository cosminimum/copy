import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Web3Provider } from "@/components/providers/web3-provider"
import { SessionProvider } from "@/components/providers/session-provider"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Forecast Market",
  description: "Automated copy trading platform for Polymarket",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <SessionProvider>
          <Web3Provider>
            {children}
            <Toaster />
          </Web3Provider>
        </SessionProvider>
      </body>
    </html>
  )
}
