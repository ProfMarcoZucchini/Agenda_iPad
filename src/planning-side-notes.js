// 0.1.148 — navigazione tra Planning e due quaderni di appunti permanenti.
// Modulo di sola navigazione: non modifica i gestori Pencil, la persistenza o il Backup.
export const PLANNING_SIDE_NOTES = Object.freeze({
  'planning-events': Object.freeze({ title: 'Eventi importanti', key: '::planning-important-events' }),
  'planning-goals': Object.freeze({ title: 'Obiettivi importanti', key: '::planning-important-goals' })
});

export function isPlanningSideNote(kind) {
  return Object.prototype.hasOwnProperty.call(PLANNING_SIDE_NOTES, kind);
}
export function planningSideNoteTitle(kind) {
  return PLANNING_SIDE_NOTES[kind]?.title || '';
}
export function planningSideNoteKey(kind) {
  return PLANNING_SIDE_NOTES[kind]?.key || '';
}
// direction: -1 = swipe verso destra; +1 = swipe verso sinistra.
// Le due pagine non si attraversano fra loro: si ritorna sempre al Planning.
export function planningSideSwipeTarget(currentKind, direction, isOrdinaryPlanner = false) {
  if (isOrdinaryPlanner) return direction === -1 ? 'planning-goals' : direction === 1 ? 'planning-events' : null;
  if (currentKind === 'planning-goals' && direction === 1) return 'planner-return';
  if (currentKind === 'planning-events' && direction === -1) return 'planner-return';
  return null;
}
