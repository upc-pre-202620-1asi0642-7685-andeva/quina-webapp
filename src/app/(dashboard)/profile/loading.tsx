'use client';

export default function ProfileLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-6 motion-reduce:animate-none">
      {/* Cabecera de identidad */}
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="size-14 shrink-0 rounded-full bg-paper-deep sm:size-16" />
          <div className="flex flex-col gap-2">
            <div className="h-6 w-48 rounded-full bg-paper-deep" />
            <div className="h-4 w-56 max-w-full rounded-full bg-paper-deep" />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="h-4 w-32 rounded-full bg-paper-deep" />
          <div className="h-3.5 w-28 rounded-full bg-paper-deep" />
        </div>
      </div>

      {/* Píldoras móviles */}
      <div className="flex gap-2 overflow-hidden lg:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-11 w-28 shrink-0 rounded-full bg-paper-deep" />
        ))}
      </div>

      {/* Rail lateral + tarjetas */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[248px_1fr] lg:items-start lg:gap-8">
        <div className="hidden flex-col gap-2 rounded-card border border-line bg-surface p-2 lg:flex">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 rounded-field bg-paper-deep" />
          ))}
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
            <div className="h-5 w-40 rounded-full bg-paper-deep" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-11 rounded-field bg-paper-deep" />
              <div className="h-11 rounded-field bg-paper-deep" />
            </div>
            <div className="h-11 w-36 rounded-full bg-paper-deep" />
          </div>

          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
            <div className="h-5 w-44 rounded-full bg-paper-deep" />
            <div className="h-11 rounded-field bg-paper-deep" />
            <div className="h-11 w-48 rounded-full bg-paper-deep" />
          </div>
        </div>
      </div>
    </div>
  );
}
