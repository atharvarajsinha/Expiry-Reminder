/** Joins class names, dropping anything falsy. */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
