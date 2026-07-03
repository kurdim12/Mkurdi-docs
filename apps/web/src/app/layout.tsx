import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'MKurdi Ops — ذاكرة شركة المقاولات',
  description: 'منصة ذكاء الوثائق لشركة مقاولات أردنية: عقود، كتب رسمية، كفالات، مستخلصات.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-e border-line bg-card">
            <div className="sticky top-0 p-5">
              <Link href="/" className="block">
                <div className="text-xl font-bold tracking-tight">MKurdi Ops</div>
                <div className="mt-1 text-sm text-muted">ذاكرة شركة المقاولات</div>
              </Link>
              <nav className="mt-8 space-y-1 text-sm">
                <Link
                  href="/"
                  className="block rounded-md px-3 py-2 hover:bg-paper"
                >
                  الموجز الصباحي
                </Link>
              </nav>
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
