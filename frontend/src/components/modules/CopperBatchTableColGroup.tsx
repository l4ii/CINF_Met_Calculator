/**
 * table-fixed 下首行 colSpan 标题会均分列宽；必须用 colgroup 锁定各列宽度。
 */
export function CopperBatchTableColGroup({ widths }: { widths: number[] }) {
  return (
    <colgroup>
      {widths.map((width, index) => (
        <col key={index} style={{ width }} />
      ))}
    </colgroup>
  )
}
