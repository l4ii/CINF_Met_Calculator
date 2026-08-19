import {
  buildProcessTextExportDocx,
  type ProcessTextExportMeta,
} from './processTextExportDocx.ts'
import type { AntimonyBatchWorkbookSheet } from './antimonyBatchExport.ts'

export type AntimonyProcessTextExportMeta = ProcessTextExportMeta

export async function buildAntimonyProcessTextExportDocx(
  meta: AntimonyProcessTextExportMeta,
  sheets: AntimonyBatchWorkbookSheet[]
): Promise<ArrayBuffer> {
  return buildProcessTextExportDocx(meta, sheets)
}
