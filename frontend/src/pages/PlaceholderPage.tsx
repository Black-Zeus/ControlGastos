import { Construction } from 'lucide-react'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-slate-800">
        <Construction size={24} className="text-gray-400 dark:text-slate-500" />
      </div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Esta sección está en desarrollo</p>
    </div>
  )
}
