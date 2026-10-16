import type { Metadata } from 'next';
import './globals.css';
import ServiceWorkerRegister from './components/ServiceWorkerRegister';
import Toaster from './components/Toaster';
import { LanguageProvider } from './i18n/LanguageContext';

export const metadata: Metadata = {
  title: 'Limited Rock Paper Scissors',
  description: 'Real-time 1v1 limited rock-paper-scissors web game',
  manifest: '/manifest.json',
  themeColor: '#08090a',
  appleWebApp: {
    capable: true,
    title: 'Limited RPS',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      {
        url: '/icons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Noto+Serif+JP:wght@600;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LanguageProvider>
          {children}
          <Toaster />
          <ServiceWorkerRegister />
        </LanguageProvider>
      </body>
    </html>
  );
}
