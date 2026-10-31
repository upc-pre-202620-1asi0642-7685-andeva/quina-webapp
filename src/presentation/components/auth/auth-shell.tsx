import Image from 'next/image';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';
import { AuthAside, type AuthAsideVariant } from './auth-aside';

export type AuthShellProps = {
  logoAlt: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  aside?: AuthAsideVariant;
};

/**
 * Pantallas de acceso en dos columnas (DESIGN.md §6.1): el formulario a la
 * izquierda y el panel de marca a la derecha desde 1024 px. En celular solo
 * queda el formulario, sin tarjeta alrededor.
 */
export function AuthShell({
  logoAlt,
  title,
  subtitle,
  children,
  footer,
  aside = 'login',
}: AuthShellProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2 lg:gap-3 lg:p-3">
      <main className="flex flex-col px-4 pt-5 pb-10 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <Image src={isologo} alt={logoAlt} priority className="h-8 w-auto" />
          {footer ? <div className="hidden text-sm text-ink-soft sm:block">{footer}</div> : null}
        </div>

        {/* pt-12 fijo: en pantallas bajas el centrado no deja pegado el título a la barra */}
        <div className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center gap-7 pt-12">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink">{title}</h1>
            <p className="text-base text-pretty text-ink-soft">{subtitle}</p>
          </header>
          {children}
          {footer ? (
            <div className="text-center text-sm text-ink-soft sm:hidden">{footer}</div>
          ) : null}
        </div>
      </main>

      <AuthAside variant={aside} />
    </div>
  );
}
