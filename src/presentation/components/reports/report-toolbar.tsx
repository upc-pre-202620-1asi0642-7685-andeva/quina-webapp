'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarRangeIcon } from 'lucide-react';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { FormField } from '@/presentation/components/auth/form-field';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { PeriodSegmentedControl } from '@/presentation/components/dashboard/chart-primitives';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/presentation/components/ui/popover';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import { resolveReportPreset, type ReportPreset } from '@/presentation/lib/report-range';

const MAX_DAYS = 366;

/** Barra de rango rápido, selector de fechas (Popover/Sheet) e impresión del reporte. */
export function ReportToolbar({
  from,
  to,
  activePreset,
  printLabel,
}: {
  from: string;
  to: string;
  activePreset: ReportPreset;
  printLabel: string;
}) {
  const t = useTranslations('Reports');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);
  const [dateError, setDateError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  function handleOpenChange(next: boolean) {
    if (next) {
      setFromValue(from);
      setToValue(to);
      setDateError(undefined);
    }
    setOpen(next);
  }

  function handlePresetChange(next: ReportPreset) {
    if (next === 'custom') {
      handleOpenChange(true);
      return;
    }
    const range = resolveReportPreset(next, new Date());
    router.push(
      `/reports?from=${BusinessDate.toISO(range.from)}&to=${BusinessDate.toISO(range.to)}`,
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const parsedFrom = BusinessDate.parse(fromValue);
      const parsedTo = BusinessDate.parse(toValue);
      const days = BusinessDate.daysBetween(parsedFrom, parsedTo);
      if (days < 0 || days > MAX_DAYS) {
        setDateError(t('toolbar.rangeError'));
        return;
      }
      setDateError(undefined);
      setOpen(false);
      router.push(`/reports?from=${fromValue}&to=${toValue}`);
    } catch {
      setDateError(t('toolbar.rangeError'));
    }
  }

  const dateForm = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField id="report-from" label={t('from')} hint={t('toolbar.dateHint')} error={dateError}>
        {(props) => (
          <Input
            {...props}
            name="from"
            type="date"
            value={fromValue}
            onChange={(e) => {
              setFromValue(e.target.value);
              if (dateError) setDateError(undefined);
            }}
            className="text-base tabular-nums"
            required
          />
        )}
      </FormField>

      <FormField id="report-to" label={t('to')} hint={t('toolbar.limitHint')}>
        {(props) => (
          <Input
            {...props}
            name="to"
            type="date"
            value={toValue}
            onChange={(e) => {
              setToValue(e.target.value);
              if (dateError) setDateError(undefined);
            }}
            className="text-base tabular-nums"
            required
          />
        )}
      </FormField>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
          {t('toolbar.cancel')}
        </Button>
        <Button type="submit" variant="secondary">
          {t('submit')}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <PeriodSegmentedControl
        ariaLabel={t('toolbar.presetsAria')}
        value={activePreset}
        onChange={handlePresetChange}
        className="max-w-full flex-wrap rounded-card sm:rounded-full"
        options={[
          { value: 'today', label: t('toolbar.presets.today') },
          { value: '7d', label: t('toolbar.presets.7d') },
          { value: 'thisMonth', label: t('toolbar.presets.thisMonth') },
          { value: 'lastMonth', label: t('toolbar.presets.lastMonth') },
          { value: 'custom', label: t('toolbar.presets.custom') },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        {isDesktop ? (
          <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
              <Button type="button" variant="secondary">
                <CalendarRangeIcon aria-hidden="true" />
                {t('toolbar.changeDates')}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-80 rounded-card border border-line bg-surface p-4 text-ink shadow-float"
            >
              {dateForm}
            </PopoverContent>
          </Popover>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(true)}>
              <CalendarRangeIcon aria-hidden="true" />
              {t('toolbar.changeDates')}
            </Button>
            <ResponsiveSheet
              open={open}
              onOpenChange={handleOpenChange}
              title={t('toolbar.sheetTitle')}
              description={t('toolbar.sheetDescription')}
              closeLabel={t('toolbar.close')}
            >
              {dateForm}
            </ResponsiveSheet>
          </>
        )}

        <PrintButton label={printLabel} />
      </div>
    </div>
  );
}
