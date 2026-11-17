import './globals.css';

export const metadata = {
  title: 'MySQL Query Analyzer',
  description: 'Analyse real MySQL EXPLAIN ANALYZE plans on a shop database',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
