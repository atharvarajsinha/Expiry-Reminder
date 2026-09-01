import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  History,
  Info,
  Pencil,
  StickyNote,
  Trash2,
} from 'lucide-react';

import { Button } from '../components/common/Button.jsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { DetailList, SectionCard } from '../components/common/DetailList.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { Skeleton, SkeletonGroup } from '../components/common/Skeleton.jsx';
import { ExpiryStatus } from '../components/items/ExpiryStatus.jsx';
import { ItemFormModal } from '../components/items/ItemFormModal.jsx';
import { ReminderHistoryList } from '../components/reminders/ReminderList.jsx';
import { deleteItem, getCategories, getItem } from '../api/items.js';
import { getReminders } from '../api/reminders.js';
import { useToast } from '../hooks/useToast.js';
import { findCategory, iconForItem } from '../utils/categories.js';
import { formatDate, formatDateTime } from '../utils/date.js';
import { ERROR_CODE, getApiError } from '../utils/errors.js';
import { displayIdentifier } from '../utils/identifier.js';

function DetailsSkeleton() {
  return (
    <SkeletonGroup label="Loading item" className="grid gap-4">
      <div className="surface p-5">
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12" rounded="rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
      </div>
      {[0, 1].map((index) => (
        <div key={index} className="surface space-y-3 p-5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** One tracked date, with its status and any reference number. */
function ExpiryRow({ expiry }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          {expiry.label}
        </p>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
          <time dateTime={expiry.expiresOn || undefined}>
            {formatDate(expiry.expiresOn, 'No date')}
          </time>
        </p>
        {expiry.reference ? (
          <p className="mt-0.5 font-mono text-xs tracking-wide text-slate-500 dark:text-slate-400">
            {expiry.reference}
          </p>
        ) : null}
      </div>

      <ExpiryStatus expiry={expiry} showDistance className="shrink-0" />
    </li>
  );
}

/**
 * Everything known about one item, plus the reminders it has produced.
 *
 * The reminder history is fetched alongside the item because "did it actually
 * email me?" is the question this page exists to answer when something has
 * already lapsed.
 */
export default function ItemDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [item, setItem] = useState(null);
  const [categories, setCategories] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextItem, nextCategories, nextReminders] = await Promise.all([
        getItem(id),
        getCategories(),
        getReminders({ itemId: id, limit: 20 }),
      ]);
      setItem(nextItem);
      setCategories(nextCategories);
      setReminders(nextReminders);
      setError(null);
    } catch (requestError) {
      const apiError = getApiError(requestError);
      if (!apiError.isUnauthorized) setError(apiError);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteItem(id);
      toast.success(`${item.name} deleted.`);
      navigate('/items', { replace: true });
    } catch (requestError) {
      toast.error(getApiError(requestError).message);
      setIsDeleting(false);
      setIsConfirmOpen(false);
    }
  };

  const category = item ? findCategory(categories, item.category) : null;
  const Icon = item ? iconForItem(categories, item) : CalendarClock;

  return (
    <>
      <Link
        to="/items"
        className="mb-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        All items
      </Link>

      {isLoading ? (
        <DetailsSkeleton />
      ) : error ? (
        <ErrorState
          title={
            error.code === ERROR_CODE.ITEM_NOT_FOUND
              ? "We couldn't find that item."
              : "We couldn't load this item."
          }
          description={error.message}
          onRetry={error.code === ERROR_CODE.ITEM_NOT_FOUND ? undefined : load}
          offline={error.code === ERROR_CODE.OFFLINE}
        />
      ) : (
        <div className="grid gap-4">
          <header className="surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                <Icon aria-hidden="true" className="h-6 w-6" />
              </span>

              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {item.name}
                </h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>{item.categoryLabel}</span>
                  {item.identifier ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tracking-wide">
                        {displayIdentifier(category, item.identifier)}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  variant="secondary"
                  icon={Pencil}
                  onClick={() => setIsEditOpen(true)}
                  fullWidth
                  className="sm:w-auto"
                >
                  Edit
                </Button>
                <Button
                  variant="danger-outline"
                  icon={Trash2}
                  onClick={() => setIsConfirmOpen(true)}
                  fullWidth
                  className="sm:w-auto"
                >
                  Delete
                </Button>
              </div>
            </div>
          </header>

          <SectionCard icon={CalendarClock} title="Tracked dates">
            <ul>
              {item.expiries.map((expiry) => (
                <ExpiryRow key={expiry.key} expiry={expiry} />
              ))}
            </ul>
          </SectionCard>

          <SectionCard icon={Info} title="Details">
            <DetailList
              items={[
                { label: category?.issuerLabel || 'Provider', value: item.issuer },
                { label: category?.holderLabel || 'Belongs to', value: item.holder },
                {
                  label: category?.identifierLabel || 'Reference',
                  value: displayIdentifier(category, item.identifier),
                  mono: true,
                  hint: category?.isCard
                    ? 'Only the last 4 digits are stored.'
                    : undefined,
                },
                { label: 'Added', value: formatDateTime(item.createdAt) },
                { label: 'Last edited', value: formatDateTime(item.updatedAt) },
              ]}
            />
          </SectionCard>

          {item.notes ? (
            <SectionCard icon={StickyNote} title="Notes">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {item.notes}
              </p>
            </SectionCard>
          ) : null}

          <SectionCard icon={History} title="Reminder history">
            {reminders.length ? (
              <ReminderHistoryList reminders={reminders} />
            ) : (
              <EmptyState
                icon={History}
                title="No reminders sent for this item yet."
                description="One will be recorded here as soon as a date comes within your reminder window."
                className="border-0 shadow-none"
              />
            )}
          </SectionCard>
        </div>
      )}

      {item ? (
        <ItemFormModal
          open={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSaved={load}
          categories={categories}
          item={item}
        />
      ) : null}

      <ConfirmDialog
        open={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={onDelete}
        title={`Delete ${item?.name || 'this item'}?`}
        confirmLabel="Delete"
        loading={isDeleting}
      >
        <p>
          This removes the item, every date on it, and its reminder history. It
          cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
