import type { SelectionAngle } from './types'

/** A key for a set of selected layers that does not depend on the order they were selected in. */
export function selectionKey(ids: Iterable<string>): string {
  return [...ids].sort().join('\n')
}

/**
 * The angle a rotation left the current selection's box at, as Figma keeps a rotated selection's
 * box turned for as long as that selection lasts; undefined for any other selection.
 */
export function storedSelectionAngle(
  selectedIds: Iterable<string>,
  stored: SelectionAngle | null | undefined
): number | undefined {
  return stored && stored.key === selectionKey(selectedIds) ? stored.angle : undefined
}
