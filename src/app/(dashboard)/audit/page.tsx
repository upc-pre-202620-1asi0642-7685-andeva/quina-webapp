import Form from 'next/form';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DownloadIcon, FilterIcon, ShieldCheckIcon } from 'lucide-react';
import {
  AUDIT_ENTITY_NAMES,
  listAuditActors,
  listAuditLogs,
  type AuditLogEntry,
} from '@/infrastructure/db/queries/audit';
import { requireStoreUser } from '@/presentation/auth/guards';
import { FormField } from '@/presentation/components/auth/form-field';
import { buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { formatDate } from '@/presentation/lib/format-date';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    userId?: string;
    entityName?: string;
  }>;
}) {
  const user = await requireStoreUser('/audit', 'settings.billing');
  const t = await getTranslations('Audit');
  const { from = '', to = '', userId = '', entityName = '' } = await searchParams;

  const filters = {
    from: from || undefined,
    to: to || undefined,
    userId: userId || undefined,
    entityName: entityName || undefined,
  };

  const [entries, actors] = await Promise.all([
    listAuditLogs(user.storeId, filters),
    listAuditActors(user.storeId),
  ]);

  const exportParams = new URLSearchParams();
  if (from) exportParams.set('from', from);
  if (to) exportParams.set('to', to);
  if (userId) exportParams.set('userId', userId);
  if (entityName) exportParams.set('entityName', entityName);
  const exportQs = exportParams.toString();
  const exportHref = `/app/api/audit/export${exportQs ? `?${exportQs}` : ''}`;

  const actionLabel = (action: string) =>
    t.has(`actions.${action}`) ? t(`actions.${action}`) : action;

  const entityLabel = (entity: string) =>
    t.has(`entities.${entity}`) ? t(`entities.${entity}`) : entity;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        <a
          href={exportHref}
          download="quina-auditoria.csv"
          className={buttonVariants({ variant: 'secondary' })}
        >
          <DownloadIcon aria-hidden="true" />
          {t('exportCsvButton')}
        </a>
      </header>

      {/* Filtros por rango de fechas, usuario y entidad (US18 crit. 5) */}
      <Form
        action="/audit"
        className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
      >
        <FormField id="audit-from" label={t('filters.from')} hint={t('filters.fromHint')}>
          {(props) => <Input {...props} type="date" name="from" defaultValue={from} />}
        </FormField>

        <FormField id="audit-to" label={t('filters.to')} hint={t('filters.toHint')}>
          {(props) => <Input {...props} type="date" name="to" defaultValue={to} />}
        </FormField>

        <FormField id="audit-user" label={t('filters.user')} hint={t('filters.userHint')}>
          {(props) => (
            <select
              {...props}
              name="userId"
              defaultValue={userId}
              className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-link-active"
            >
              <option value="">{t('filters.allUsers')}</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField id="audit-entity" label={t('filters.entity')} hint={t('filters.entityHint')}>
          {(props) => (
            <select
              {...props}
              name="entityName"
              defaultValue={entityName}
              className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-link-active"
            >
              <option value="">{t('filters.allEntities')}</option>
              {AUDIT_ENTITY_NAMES.map((ent) => (
                <option key={ent} value={ent}>
                  {entityLabel(ent)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <div className="flex items-center gap-2">
          <button type="submit" className={buttonVariants()}>
            <FilterIcon aria-hidden="true" />
            {t('filters.apply')}
          </button>
          {from || to || userId || entityName ? (
            <Link href="/audit" className={buttonVariants({ variant: 'ghost' })}>
              {t('filters.clear')}
            </Link>
          ) : null}
        </div>
      </Form>

      {entries.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <ShieldCheckIcon aria-hidden="true" className="size-8 text-ink-soft" />
          <p className="text-sm text-ink-soft">{t('empty')}</p>
        </section>
      ) : (
        <section aria-label={t('title')} className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft tabular-nums">
            {t('count', { count: entries.length })}
          </p>

          <ol className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{actionLabel(entry.action)}</span>
                    <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                      {entityLabel(entry.entityName)}
                    </span>
                  </div>
                  <span className="text-xs text-ink-soft tabular-nums">
                    {formatDate(entry.createdAt)} · {entry.userName ?? t('systemActor')}
                    {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
                  </span>
                </div>

                <AuditDataDiff entry={entry} beforeLabel={t('before')} afterLabel={t('after')} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function AuditDataDiff({
  entry,
  beforeLabel,
  afterLabel,
}: {
  entry: AuditLogEntry;
  beforeLabel: string;
  afterLabel: string;
}) {
  if (!entry.oldData && !entry.newData) return null;

  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      {entry.oldData ? (
        <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-2.5">
          <span className="font-medium text-ink-soft">{beforeLabel}</span>
          <pre className="overflow-x-auto font-sans break-words whitespace-pre-wrap text-ink tabular-nums">
            {formatDataSummary(entry.oldData)}
          </pre>
        </div>
      ) : null}
      {entry.newData ? (
        <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-2.5">
          <span className="font-medium text-ink-soft">{afterLabel}</span>
          <pre className="overflow-x-auto font-sans break-words whitespace-pre-wrap text-ink tabular-nums">
            {formatDataSummary(entry.newData)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function formatDataSummary(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}
