import Image from 'next/image';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';

export type AuthShellProps = {
  logoAlt: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({ logoAlt, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Image src={isologo} alt={logoAlt} priority className="h-9 w-auto self-start" />
      <section className="flex flex-col gap-6 rounded-card border border-line bg-surface p-6">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="text-sm text-ink-soft">{subtitle}</p>
        </header>
        {children}
      </section>
      {footer ? <div className="text-center text-sm text-ink-soft">{footer}</div> : null}
    </main>
  );
}
