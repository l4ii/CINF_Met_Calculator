import {
  buildProcessTextExportDocx,
  type ProcessTextExportMeta,
} from './processTextExportDocx.ts'
import type { CopperBatchWorkbookSheet } from './copperBatchExport.ts'

export type CopperProcessTextExportMeta = ProcessTextExportMeta

export async function buildCopperProcessTextExportDocx(
  meta: CopperProcessTextExportMeta,
  sheets: CopperBatchWorkbookSheet[]
): Promise<ArrayBuffer> {
  return buildProcessTextExportDocx(meta, sheets)
}
