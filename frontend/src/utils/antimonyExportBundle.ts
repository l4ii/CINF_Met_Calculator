export type AntimonyExportBundleFile = {
  fileName: string
  content: ArrayBuffer
}

export type AntimonyExportBundleResult =
  | { ok: true; folderPath: string }
  | { ok: false; cancelled?: boolean; error?: string }

type ElectronExportBundleApi = {
  exportBundleToDirectory?: (
    folderName: string,
    files: AntimonyExportBundleFile[]
  ) => Promise<AntimonyExportBundleResult>
}

const DEFAULT_FLO_TEMPLATE_PATH = 'templates/southwest-antimony-wu.flo'

export async function loadDefaultAntimonyFloTemplate(): Promise<ArrayBuffer> {
  const templateUrl = new URL(`${import.meta.env.BASE_URL}${DEFAULT_FLO_TEMPLATE_PATH}`, window.location.href)
  const response = await fetch(templateUrl)
  if (!response.ok) {
    throw new Error(`未能读取内置 Flo 模板（${response.status}）。`)
  }
  return response.arrayBuffer()
}

export async function saveAntimonyExportBundle(
  folderName: string,
  files: AntimonyExportBundleFile[]
): Promise<AntimonyExportBundleResult> {
  const saver = (window as typeof window & { electronAPI?: ElectronExportBundleApi }).electronAPI
    ?.exportBundleToDirectory
  if (!saver) {
    return { ok: false, error: '当前环境不支持导出到文件夹，请在桌面版软件中使用此功能。' }
  }
  return saver(folderName, files)
}
