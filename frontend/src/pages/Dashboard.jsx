import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, LayoutGrid, Plus, RefreshCw } from 'lucide-react';

import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { InstallPrompt } from '../components/common/InstallPrompt.jsx';
import { ItemCard, ItemListSkeleton } from '../components/items/ItemCard.jsx';
import { ItemFormModal } from '../components/items/ItemFormModal.jsx';
import {
  ItemSummaryCards,
  ItemSummaryCardsSkeleton,
} from '../components/items/ItemSummaryCards.jsx';
import { useItems } from '../hooks/useItems.js';
import { ERROR_CODE } from '../utils/errors.js';
import { needsAttention } from '../utils/status.js';

/** How many cards the overview shows before pointing at the full list. */
const PREVIEW_COUNT = 6;

/**
 * The overview: counters, then whatever needs attention first.
 *
 * The list is loaded once and reloaded after a mutation - there is no polling
 * timer here, so the API is never hammered just because a tab is open.
 */
export default function Dashboard() {
  const { items, categories, isLoading, isReloading, error, reload } = useItems();
  const [editing, setEditing] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const urgent = useMemo(() => items.filter(needsAttention), [items]);

  // The backend already sorts by soonest expiry, so the first few cards are
  // the ones worth looking at; no client-side re-sorting needed.
  const preview = items.slice(0, PREVIEW_COUNT);

  const openAdd = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setIsFormOpen(true);
  };

  return (
    <>
      <InstallPrompt />

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Everything you track, soonest to expire first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            iconOnly
            icon={RefreshCw}
            loading={isReloading}
            onClick={reload}
            aria-label="Refresh overview"
            title="Refresh overview"
          />
          <Button icon={Plus} onClick={openAdd}>
            Add Item
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-5">
          <ItemSummaryCardsSkeleton />
          <ItemListSkeleton count={2} />
        </div>
      ) : error ? (
        <ErrorState
          title="We couldn't load your items."
          description={error.message}
          onRetry={reload}
          isRetrying={isReloading}
          offline={error.code === ERROR_CODE.OFFLINE}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nothing tracked yet."
          description="Add a vehicle, a card, a passport - anything with a date you would rather not miss."
          action={
            <Button icon={Plus} onClick={openAdd}>
              Add Item
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5">
          <ItemSummaryCards items={items} />

          {urgent.length ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl bg-red-50 p-3.5 text-sm text-red-800 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/20"
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
              />
              <p>
                <span className="font-semibold">
                  {urgent.length} item{urgent.length === 1 ? '' : 's'} need
                  {urgent.length === 1 ? 's' : ''} attention
                </span>{' '}
                - something has expired or expires today.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4">
            {preview.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                categories={categories}
                onEdit={openEdit}
              />
            ))}
          </div>

          {items.length > preview.length ? (
            <Link
              to="/items"
              className="mx-auto rounded-lg px-3 py-2 text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
            >
              View all {items.length} items
            </Link>
          ) : null}
        </div>
      )}

      <ItemFormModal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={reload}
        categories={categories}
        item={editing}
      />
    </>
  );
}
