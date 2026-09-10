import { BookOpen, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="tareas-app grain" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="empty-state" style={{ maxWidth: 430 }}>
        <div className="empty-orb"><BookOpen size={24} /></div>
        <p className="eyebrow">Página no encontrada</p>
        <h1 style={{ fontFamily: 'var(--app-font-serif)', fontSize: 38, margin: 0, letterSpacing: '-.05em' }}>Volvamos al aula.</h1>
        <p>Este lugar no existe en Tareas. Regresa al acceso para continuar.</p>
        <Link href="/" className="primary-btn" style={{ marginTop: 20 }} data-testid="link-back-home">
          Ir al inicio <ChevronRight size={17} />
        </Link>
      </div>
    </div>
  );
}
