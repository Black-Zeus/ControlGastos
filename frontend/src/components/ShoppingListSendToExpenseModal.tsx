import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { userApi, type ShoppingList, type UserCategory } from '@/lib/userApi'
import { fmtMoney } from '@/components/ui/KpiCard'
import { useResponsibleTags } from '@/hooks/useResponsibleTags'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const btnBase = 'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors'
const inputCls = cn(
  'rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors',
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
  'placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
)

function ResponsibleCombobox({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = options.filter(option => option.toLowerCase().includes(value.toLowerCase()))

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          id="ste-resp"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          placeholder="Ej: familia"
          className={cn(inputCls, 'w-full pr-9')}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
        >
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-900">
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">Sin resultados</li>
            ) : filtered.map(option => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => { onChange(option); setOpen(false) }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors',
                    option === value
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {option}
                  {option === value && <Check size={13} className="text-primary-500" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ShoppingListSendToExpenseModal({ list, categories, currency, defaultResponsible = '', onClose, onSuccess }: {
  list: ShoppingList
  categories: UserCategory[]
  currency: string
  defaultResponsible?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [categoryId, setCategoryId] = useState(list.default_category_id ?? '')
  const [observation, setObservation] = useState('')
  const [responsible, setResponsible] = useState(defaultResponsible)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { tags: responsibleTags, addTag: addResponsibleTag } = useResponsibleTags()

  useEffect(() => {
    if (!responsible && defaultResponsible) setResponsible(defaultResponsible)
  }, [defaultResponsible, responsible])

  const unsentByTimestamp = list.items.filter(i => i.purchased && !i.sent_at)
  const purchased = list.pending_send_count === unsentByTimestamp.length
    ? unsentByTimestamp
    : list.items.filter(i => i.purchased)
  const alreadySentCount = Math.max(0, list.purchased_count - list.pending_send_count)
  const willUpdateExpense = alreadySentCount > 0
  const total = purchased.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price ?? 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      if (responsible.trim()) addResponsibleTag(responsible)
      await userApi.shoppingLists.sendToExpense(list.id, {
        date,
        category_id: categoryId || undefined,
        observation: observation || null,
        responsible_tag: responsible || null,
      })
      onSuccess()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Enviar a egreso" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-xl bg-primary-50 dark:bg-primary-900/20 px-4 py-2.5 text-sm text-primary-700 dark:text-primary-400">
          {willUpdateExpense ? 'Se actualizará el egreso existente agregando' : 'Se registrará un egreso de'}{' '}
          <span className="font-semibold">{fmtMoney(total, currency)}</span> con
          el detalle de {purchased.length} producto{purchased.length === 1 ? '' : 's'}. La lista no se modifica.
        </p>
        {alreadySentCount > 0 && (
          <p className="text-xs text-gray-400 dark:text-slate-500">
            {alreadySentCount} producto{alreadySentCount === 1 ? '' : 's'} ya se incluyó en un envío anterior y no
            se vuelve a cobrar; solo se agregará lo nuevo al egreso ya creado.
          </p>
        )}

        <div>
          <label htmlFor="ste-date" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Fecha</label>
          <input id="ste-date" type="date" value={date} onChange={e => setDate(e.target.value)} required className={cn(inputCls, 'w-full')} />
        </div>

        <div>
          <label htmlFor="ste-cat" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Categoría{!list.default_category_id && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          <select
            id="ste-cat" value={categoryId} onChange={e => setCategoryId(e.target.value)}
            required={!list.default_category_id}
            className={cn(inputCls, 'w-full')}
          >
            <option value="">Selecciona una categoría</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="ste-resp" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Responsable <span className="font-normal text-gray-400 dark:text-slate-500">(opcional)</span>
          </label>
          <ResponsibleCombobox
            value={responsible}
            options={responsibleTags}
            onChange={setResponsible}
          />
        </div>

        <div>
          <label htmlFor="ste-obs" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Descripción <span className="font-normal text-gray-400 dark:text-slate-500">(opcional)</span>
          </label>
          <textarea id="ste-obs" value={observation} onChange={e => setObservation(e.target.value)} rows={2} className={cn(inputCls, 'w-full resize-none')} />
        </div>

        {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
          <button type="submit" disabled={saving} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60')}>
            {saving ? 'Enviando…' : willUpdateExpense ? 'Actualizar egreso' : 'Enviar a egreso'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
