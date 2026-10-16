import type { Metadata } from 'next';
import './globals.css';
import Toaster from './components/Toaster';
import { LanguageProvider } from './i18n/LanguageContext';

export const metadata: Metadata = {
  title: 'Limited Rock Paper Scissors',
  description: 'Real-time 1v1 limited rock-paper-scissors web game',
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
        </LanguageProvider>
      </body>
    </html>
  );
}
