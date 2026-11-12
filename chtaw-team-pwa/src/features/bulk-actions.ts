export async function runSelectedActions<T extends { id: string }>(
  items: T[],
  execute: (item: T) => Promise<unknown>,
  canContinue: () => boolean,
) {
  const succeeded: string[] = [];
  const failed: { item: T; error: string }[] = [];
  for (const item of items) {
    if (!canContinue()) {
      failed.push({ item, error: "La session a changé." });
      continue;
    }
    try { await execute(item); succeeded.push(item.id); }
    catch (reason) { failed.push({ item, error: reason instanceof Error ? reason.message : "Opération impossible." }); }
  }
  return { succeeded, failed };
}
