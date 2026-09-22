// Root layout for the admin site. Every page renders inside this.

import './globals.css';
import { Sidebar } from '@/components/Sidebar';

export const metadata = {
  title: 'Campus Navigation Admin',
  description: 'Admin tools for the Campus Navigation app',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="admin-layout">
          <Sidebar />
          <main className="admin-content">{children}</main>
        </div>
      </body>
    </html>
  );
}