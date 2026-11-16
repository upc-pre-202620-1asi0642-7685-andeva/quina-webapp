'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { sileo } from 'sileo';
import { Button } from '@/presentation/components/ui/button';

export type AuditExportFilters = {
  from?: string;
  to?: string;
  userId?: string;
  entityName?: string;
  action?: string;
  category?: string;
  q?: string;
};

export function AuditExportButton({ filters }: { filters: AuditExportFilters }) {
  const t = useTranslations('Audit');
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.entityName) params.set('entityName', filters.entityName);
      if (filters.action) params.set('action', filters.action);
      if (filters.category) params.set('category', filters.category);
      if (filters.q) params.set('q', filters.q);

      const qs = params.toString();
      const response = await fetch(`/app/api/audit/export${qs ? `?${qs}` : ''}`, {
        method: 'GET',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        sileo.error({
          title: t('export.errorTitle'),
          description: t('export.errorDescription'),
        });
        return;
      }

      const truncated = response.headers.get('X-Audit-Truncated') === 'true';
      const headerCount = response.headers.get('X-Audit-Count');
      const blob = await response.blob();

      let count = headerCount !== null ? Number.parseInt(headerCount, 10) : Number.NaN;
      if (!Number.isFinite(count)) {
        const text = await blob.text();
        const lines = text.trimEnd().split(/\r?\n/);
        count = Math.max(0, lines.length - 1);
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'quina-auditoria.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      if (truncated) {
        sileo.warning({
          title: t('export.truncatedTitle'),
          description: t('export.truncatedDescription'),
        });
      } else {
        sileo.success({
          title: t('export.successTitle', { count }),
        });
      }
    } catch {
      sileo.error({
        title: t('export.errorTitle'),
        description: t('export.errorDescription'),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="secondary" disabled={loading} onClick={handleExport}>
      {loading ? (
        <Loader2Icon aria-hidden="true" className="animate-spin" />
      ) : (
        <DownloadIcon aria-hidden="true" />
      )}
      {t('exportCsvButton')}
    </Button>
  );
}
