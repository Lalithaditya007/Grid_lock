import './globals.css';

export const metadata = {
  title: 'TOIP — Traffic Operations Intelligence Platform',
  description: 'AI-powered traffic event forecasting and resource recommendation for Bengaluru',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
