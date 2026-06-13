export const DEFAULT_LIST_PAGE_SIZE = 10
export const LIST_PAGE_SIZE_OPTIONS = [10, 20, 50] as const

export function pageCountFor(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
}

export function normalizePage(currentPage: number, totalPages: number) {
  return Math.min(Math.max(1, currentPage), totalPages)
}

export function slicePage<T>(items: T[], page: number, pageSize: number) {
  const totalPages = pageCountFor(items.length, pageSize)
  const normalizedPage = normalizePage(page, totalPages)
  const start = (normalizedPage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    normalizedPage,
    totalPages,
    visibleStart: items.length === 0 ? 0 : start + 1,
    visibleEnd: Math.min(items.length, normalizedPage * pageSize),
  }
}
