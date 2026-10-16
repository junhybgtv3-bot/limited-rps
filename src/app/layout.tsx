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
      <body>
        <LanguageProvider>
          {children}
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
