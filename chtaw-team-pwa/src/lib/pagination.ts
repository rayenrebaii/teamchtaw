export const TABLE_PAGE_SIZE = 6;
export function tablePage<T>(items: readonly T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE));
  const page = Math.max(1, Math.min(requestedPage, pages));
  return { page, pages, items: items.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE) };
}
