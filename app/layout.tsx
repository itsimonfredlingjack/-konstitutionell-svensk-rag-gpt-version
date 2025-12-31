import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { clsx } from 'clsx'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
    title: 'Constitutional Core | Neural Interface v2.4',
    description: 'Avancerad Constitutional AI - Högprecisions RAG-gränssnitt',
    icons: {
        icon: '/favicon.svg',
    },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body className={clsx(inter.variable, "antialiased")}>
                <Providers>{children}</Providers>
            </body>
        </html>
    )
}
