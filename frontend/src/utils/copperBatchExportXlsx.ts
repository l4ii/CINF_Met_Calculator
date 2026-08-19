import type { CopperBatchWorkbookSheet } from './copperBatchExport.ts'
import {
  buildReferenceBatchWorkbookXlsx,
  type BatchWorkbookXlsxOptions,
} from './batchWorkbookXlsx.ts'

export async function buildCopperBatchWorkbookXlsx(
  sheets: CopperBatchWorkbookSheet[],
  options: BatchWorkbookXlsxOptions = {}
): Promise<ArrayBuffer> {
  return buildReferenceBatchWorkbookXlsx(sheets, options)
}
