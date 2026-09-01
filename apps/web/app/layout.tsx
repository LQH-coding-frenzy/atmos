import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Atmos | Weather intelligence',
  description: 'A serverless-first weather intelligence dashboard.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
