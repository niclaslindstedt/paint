// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What you do to a *stored order*: move one id in it, and lay a list of things
// out the way it says.
//
// Three lists in this app are arrangements the user has made — the toolbar's
// buttons, a canvas preset's kit, and the right-hand panel's sections — and all
// three are persisted the same way: a list of ids, holding only the ways the
// arrangement differs from the one the build ships. They therefore all have the
// same two problems (an id this build no longer knows, and a thing the stored
// order was written before) and they are solved once, here, rather than three
// times in three places that could drift apart.
//
// Pure and DOM-free: the rules can be read and tested without a pointer.

/** Move one id to `to` in an order — what the up / down arrows send, and what a
 *  dropped drag resolves to.
 *
 *  The whole current order goes in rather than a delta, because that is the only
 *  thing a stored order can be: a permutation of ids means nothing without the
 *  list of entries it is a permutation of, and every one of these lists is read
 *  by builds that ship a different set of them (see {@link orderById}). */
export function moveInOrder(
  order: readonly string[],
  from: number,
  to: number,
): string[] {
  if (from === to || from < 0 || to < 0) return [...order];
  if (from >= order.length || to >= order.length) return [...order];
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Lay `items` out the way `order` says — and leave everything it doesn't
 * mention exactly where it already was.
 *
 * That second half is the whole point, and it is why this is not a sort. A
 * stored order is written by the build that was running when the user dragged
 * something, so it names the things *that build* shipped. A later release adds
 * a tool, an effect, a panel section; an earlier one is downgraded to. If the
 * unnamed ones were appended, every one of them would pile up at the end of a
 * list its maker had a place for — so instead the named ids are dealt back into
 * the slots they already occupy, and an item the order has never heard of keeps
 * the position it was registered in.
 *
 * Ids that this build doesn't have, and ids named twice, are dropped: a stale
 * settings blob is the usual source of both, and either would leave a hole.
 */
export function orderById<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const seen = new Set<string>();
  const named: T[] = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    const item = items.find((candidate) => candidate.id === id);
    if (!item) continue;
    seen.add(id);
    named.push(item);
  }
  if (named.length === 0) return [...items];
  let next = 0;
  return items.map((item) => (seen.has(item.id) ? named[next++]! : item));
}
