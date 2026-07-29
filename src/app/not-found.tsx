import Link from 'next/link';
import styles from './NotFound.module.css';

export default function NotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="not-found-title">
        <div className={styles.content}>
          <span className={styles.eyebrow}>404</span>
          <h1 id="not-found-title">This page slipped out of attribution.</h1>
          <p>
            The link may be old, moved, or typed with a tiny mistake. Head back to Talivia and keep
            the revenue trail clean.
          </p>
          <div className={styles.actions}>
            <Link href="/login" className={styles.primaryAction}>
              Sign in
            </Link>
          </div>
          <div className={styles.hint} aria-label="Helpful links">
            <span>Revenue analytics</span>
            <span>Paid sessions</span>
            <span>Payment diagnostics</span>
          </div>
        </div>
      </section>
    </main>
  );
}
