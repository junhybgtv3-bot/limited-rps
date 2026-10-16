import type { Metadata } from 'next';
import './globals.css';
import Toaster from './components/Toaster';

export const metadata: Metadata = {
  title: '한정 가위바위보',
  description: '1대1 실시간 한정 가위바위보 웹게임',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
