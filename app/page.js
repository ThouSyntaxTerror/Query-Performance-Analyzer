'use client';
import { useEffect } from 'react';
import { api } from './components';

export default function Home() {
  useEffect(() => {
    api('/api/me').then((u) => { window.location.href = u.role === 'admin' ? '/admin' : '/student'; }).catch(() => { window.location.href = '/login'; });
  }, []);
  return <div className="wrap"><p className="muted">Loading...</p></div>;
}
