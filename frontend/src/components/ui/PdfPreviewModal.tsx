import { Download, FileText, X } from 'lucide-react'

export function PdfPreviewModal({
  title,
  subtitle,
  blobUrl,
  filename,
  onClose,
}: {
  title: string
  subtitle?: string
  blobUrl: string
  filename: string
  onClose: () => void
}) {
  function handleDownload() {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-[10vh_10vw]">
      <div
        className="flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-slate-900"
        style={{ width: '80vw', height: '80vh' }}
      >
        {/* Barra superior */}
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-slate-800 px-4 py-3 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <FileText size={15} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 dark:text-slate-100 truncate">{title}</p>
            {subtitle && (
              <p className="text-[11px] text-gray-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Download size={13} />
            Descargar
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={13} />
            Cerrar
          </button>
        </div>

        {/* PDF */}
        <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-slate-800">
          <iframe
            src={blobUrl}
            className="w-full h-full border-none"
            title={title}
          />
        </div>
      </div>
    </div>
  )
}
