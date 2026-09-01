import { useMemo, useState } from 'react';
import { LayoutGrid, Plus, RefreshCw, Search } from 'lucide-react';

import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { Input } from '../components/common/Input.jsx';
import { ItemCard, ItemListSkeleton } from '../components/items/ItemCard.jsx';
import { ItemFormModal } from '../components/items/ItemFormModal.jsx';
import { useItems } from '../hooks/useItems.js';
import { categoryIcon } from '../utils/categories.js';
import { cn } from '../utils/cn.js';
import { ERROR_CODE } from '../utils/errors.js';
import { STATUS, needsAttention } from '../utils/status.js';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: STATUS.VALID, label: 'Valid' },
  { key: STATUS.EXPIRING_SOON, label: 'Expiring Soon' },
  { key: 'attention', label: 'Expired' },
];

/** `attention` covers both "expires today" and "already expired". */
function matchesStatus(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return needsAttention(item);
  return item.overallStatus === filter;
}

/**
 * The full list, with a search box and two rows of filters.
 *
 * The dashboard is the at-a-glance view; this page is for finding one thing
 * among many. Both read the same endpoint through `useItems`.
 */
export default function ItemsPage() {
  const { items, categories, isLoading, isReloading, error, reload } = useItems();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Only offer category chips for categories the user actually has, so the
  // filter row does not list seven things when two are in use.
  const usedCategories = useMemo(() => {
    const counts = new Map();
    for (const item of items) {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    }
    return categories.filter((entry) => counts.has(entry.key));
  }, [items, categories]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return items.filter((item) => {
      if (!matchesStatus(item, status)) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (!needle) return true;

      // Search the words a person would actually remember about an item.
      const haystack = [
        item.name,
        item.identifier,
        item.issuer,
        item.holder,
        item.categoryLabel,
        ...item.expiries.map((expiry) => expiry.label),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [items, query, status, category]);

  const hasItems = items.length > 0;
  const isFiltered = Boolean(query.trim()) || status !== 'all' || category !== 'all';

  const openAdd = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setIsFormOpen(true);
  };

  const chipClass = (isActive) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary-600 text-white'
        : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800',
    );

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Items
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {hasItems
              ? `${items.length} item${items.length === 1 ? '' : 's'} tracked`
              : 'Nothing tracked yet'}
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
            aria-label="Reload item list"
            title="Reload item list"
          />
          <Button icon={Plus} onClick={openAdd}>
            Add Item
          </Button>
        </div>
      </header>

      {hasItems && !isLoading && !error ? (
        <div className="mb-5 space-y-3">
          <Input
            id="item-search"
            type="search"
            label="Search items"
            labelHidden
            placeholder="Search by name, number, issuer or date"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            icon={Search}
            autoComplete="off"
          />

          <div
            role="group"
            aria-label="Filter by expiry status"
            className="flex flex-wrap gap-2"
          >
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                aria-pressed={status === key}
                className={chipClass(status === key)}
              >
                {label}
              </button>
            ))}
          </div>

          {usedCategories.length > 1 ? (
            <div
              role="group"
              aria-label="Filter by category"
              className="flex flex-wrap gap-2"
            >
              <button
                type="button"
                onClick={() => setCategory('all')}
                aria-pressed={category === 'all'}
                className={chipClass(category === 'all')}
              >
                Every category
              </button>
              {usedCategories.map((entry) => {
                const Icon = categoryIcon(entry.icon);
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setCategory(entry.key)}
                    aria-pressed={category === entry.key}
                    className={chipClass(category === entry.key)}
                  >
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    {entry.plural}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <ItemListSkeleton count={3} />
      ) : error ? (
        <ErrorState
          title="We couldn't load your items."
          description={error.message}
          onRetry={reload}
          isRetrying={isReloading}
          offline={error.code === ERROR_CODE.OFFLINE}
        />
      ) : !hasItems ? (
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
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching items."
          description="Try a different search term, or clear the filters."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setStatus('all');
                setCategory('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {isFiltered ? (
            <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
              Showing {visible.length} of {items.length}
            </p>
          ) : null}

          <div className="grid gap-4">
            {visible.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                categories={categories}
                onEdit={openEdit}
              />
            ))}
          </div>
        </>
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
