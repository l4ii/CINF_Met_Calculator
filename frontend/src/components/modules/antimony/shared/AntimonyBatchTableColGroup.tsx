/**
 * 锑流程的 table-fixed 表格必须用 colgroup 锁定各列宽度。
 */
export function AntimonyBatchTableColGroup({ widths }: { widths: number[] }) {
  return (
    <colgroup>
      {widths.map((width, index) => (
        <col key={index} style={{ width }} />
      ))}
    </colgroup>
  )
}
