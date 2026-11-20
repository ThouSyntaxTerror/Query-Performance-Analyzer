import './globals.css';

export const metadata = { title: 'Placement Portal', description: 'Campus placement management with MySQL and MongoDB' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
