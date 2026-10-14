import Link from 'next/link';
import type { ReactNode } from 'react';
import { LegalLinks } from './legal-links';

type LegalPageLayoutProps = {
  children: ReactNode;
  title: string;
};

export function LegalPageLayout({ children, title }: LegalPageLayoutProps) {
  return (
    <main className="atmos-page legal-page">
      <section className="dashboard-shell legal-page-shell">
        <header className="legal-page-header">
          <Link className="legal-page-brand" href="/" aria-label="Atmos home">
            a<span>o</span>
          </Link>
          <div>
            <p className="eyebrow">Atmos policies</p>
            <h1>{title}</h1>
            <p>Last updated October 14, 2026</p>
          </div>
          <Link className="legal-page-dashboard-link" href="/">
            Back to dashboard
          </Link>
        </header>

        <div className="legal-page-navigation">
          <LegalLinks />
        </div>

        <article className="panel legal-document">{children}</article>

        <footer className="legal-page-footer">
          <span>Atmos weather intelligence</span>
          <LegalLinks />
        </footer>
      </section>
    </main>
  );
}
