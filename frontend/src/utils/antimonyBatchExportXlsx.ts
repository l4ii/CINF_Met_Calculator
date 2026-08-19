import type { AntimonyBatchWorkbookSheet } from './antimonyBatchExport.ts'
import {
  buildReferenceBatchWorkbookXlsx,
  type BatchWorkbookXlsxOptions,
} from './batchWorkbookXlsx.ts'

export async function buildAntimonyBatchWorkbookXlsx(
  sheets: AntimonyBatchWorkbookSheet[],
  options: BatchWorkbookXlsxOptions = {}
): Promise<ArrayBuffer> {
  return buildReferenceBatchWorkbookXlsx(sheets, options)
}
