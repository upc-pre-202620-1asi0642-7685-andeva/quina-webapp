'use client';

import { Skeleton } from 'boneyard-js/react';
import '@/bones/registry';

const BONE = 'var(--color-paper-deep)';

export function SettingsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-6 motion-reduce:animate-none">
      {/* Encabezado e identidad */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-28 rounded-full bg-paper-deep" />
          <div className="h-4 w-72 max-w-full rounded-full bg-paper-deep" />
        </div>
        <div className="h-4 w-56 max-w-full rounded-full bg-paper-deep" />
      </div>

      {/* Franja de accesos administrativos */}
      <div className="grid divide-y divide-line rounded-card border border-line bg-surface lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <div className="size-5 shrink-0 rounded-full bg-paper-deep" />
            <div className="flex flex-col gap-1.5">
              <div className="h-4 w-24 rounded-full bg-paper-deep" />
              <div className="h-3.5 w-20 rounded-full bg-paper-deep" />
            </div>
          </div>
        ))}
      </div>

      {/* Datos de cobro + vista previa en 2 columnas */}
      <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-36 rounded-full bg-paper-deep" />
          <div className="h-4 w-80 max-w-full rounded-full bg-paper-deep" />
        </div>
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-11 rounded-field bg-paper-deep" />
              <div className="h-11 rounded-field bg-paper-deep" />
            </div>
            <div className="h-11 rounded-field bg-paper-deep" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-11 rounded-field bg-paper-deep" />
              <div className="h-11 rounded-field bg-paper-deep" />
            </div>
            <div className="h-11 w-40 rounded-full bg-paper-deep" />
          </div>
          <div className="h-72 rounded-card bg-paper-deep" />
        </div>
      </div>

      {/* Régimen tributario */}
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-40 rounded-full bg-paper-deep" />
          <div className="h-4 w-72 max-w-full rounded-full bg-paper-deep" />
        </div>
        <div className="h-7 w-36 rounded-full bg-paper-deep" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-11 rounded-field bg-paper-deep" />
          <div className="h-11 rounded-field bg-paper-deep" />
        </div>
        <div className="h-28 rounded-field bg-paper-deep" />
        <div className="h-11 w-36 rounded-full bg-paper-deep" />
      </div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <Skeleton
      name="settings"
      loading
      color={BONE}
      darkColor={BONE}
      animate="pulse"
      select="viewport"
      fallback={<SettingsSkeleton />}
    >
      {null}
    </Skeleton>
  );
}
