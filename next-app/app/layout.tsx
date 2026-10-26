import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Roster Dashboard',
  description: 'Next.js migration for the roster dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
