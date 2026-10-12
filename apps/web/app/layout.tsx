import type { Metadata } from 'next';
import { PwaRegistration } from '../components/pwa-registration';
import './globals.css';

export const metadata: Metadata = {
  title: 'Atmos | Weather intelligence',
  description: 'A serverless-first weather intelligence dashboard.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
