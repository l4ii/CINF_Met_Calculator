import { btnSecondary, inputSm } from '../theme/uiTheme'
import { LIST_PAGE_SIZE_OPTIONS } from '../utils/pagination'

export function ListPaginationBar({
  darkMode,
  visibleStart,
  visibleEnd,
  total,
  summarySuffix,
  page,
  totalPages,
  pageSize,
  onPageSizeChange,
  onPrevPage,
  onNextPage,
}: {
  darkMode: boolean
  visibleStart: number
  visibleEnd: number
  total: number
  summarySuffix?: string
  page: number
  totalPages: number
  pageSize: number
  onPageSizeChange: (size: number) => void
  onPrevPage: () => void
  onNextPage: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
        {visibleStart}-{visibleEnd} / {total}
        {summarySuffix ? `（${summarySuffix}）` : ''}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${inputSm(darkMode)} h-9 w-24 text-center`}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {LIST_PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} / 页
            </option>
          ))}
        </select>
        <button type="button" className={btnSecondary(darkMode)} disabled={page <= 1} onClick={onPrevPage}>
          上一页
        </button>
        <span className={`min-w-[5rem] text-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className={btnSecondary(darkMode)}
          disabled={page >= totalPages}
          onClick={onNextPage}
        >
          下一页
        </button>
      </div>
    </div>
  )
}
