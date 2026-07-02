import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Bell, BellOff, Camera, Check, Eye, EyeOff, Loader2, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { userApi } from '@/lib/userApi'
import { useUserStore } from '@/stores/userStore'
import { useAvatarUrl } from '@/hooks/useAvatarUrl'

// ─── Zona horaria del navegador ───────────────────────────────────────────────

const BROWSER_TZ: string = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
})()

function resolveInitialTz(dbTz: string | undefined): string {
  if (!dbTz || dbTz === 'UTC') return BROWSER_TZ || 'UTC'
  return dbTz
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CURRENCIES: { code: string; name: string; decimals: number }[] = [
  { code: 'BOB', name: 'Boliviano',                decimals: 2 },
  { code: 'CRC', name: 'Colón costarricense',      decimals: 0 },
  { code: 'USD', name: 'Dólar estadounidense',     decimals: 2 },
  { code: 'EUR', name: 'Euro',                     decimals: 2 },
  { code: 'PYG', name: 'Guaraní paraguayo',        decimals: 0 },
  { code: 'ARS', name: 'Peso argentino',           decimals: 2 },
  { code: 'CLP', name: 'Peso chileno',             decimals: 0 },
  { code: 'COP', name: 'Peso colombiano',          decimals: 0 },
  { code: 'MXN', name: 'Peso mexicano',            decimals: 2 },
  { code: 'UYU', name: 'Peso uruguayo',            decimals: 2 },
  { code: 'BRL', name: 'Real brasileño',           decimals: 2 },
  { code: 'PEN', name: 'Sol peruano',              decimals: 2 },
]

const TIMEZONES: { zone: string; label: string }[] = [
  { zone: 'America/Costa_Rica',              label: 'Costa Rica — GMT−6' },
  { zone: 'America/Guatemala',               label: 'Guatemala — GMT−6' },
  { zone: 'America/El_Salvador',            label: 'El Salvador — GMT−6' },
  { zone: 'America/Tegucigalpa',            label: 'Honduras — GMT−6' },
  { zone: 'America/Managua',                label: 'Nicaragua — GMT−6' },
  { zone: 'America/New_York',               label: 'EE.UU. Este — GMT−5/−4' },
  { zone: 'America/Chicago',                label: 'EE.UU. Centro — GMT−6/−5' },
  { zone: 'America/Denver',                 label: 'EE.UU. Montaña — GMT−7/−6' },
  { zone: 'America/Los_Angeles',            label: 'EE.UU. Oeste — GMT−8/−7' },
  { zone: 'America/Mexico_City',            label: 'México (CDMX) — GMT−6/−5' },
  { zone: 'America/Bogota',                 label: 'Colombia — GMT−5' },
  { zone: 'America/Lima',                   label: 'Perú — GMT−5' },
  { zone: 'America/Guayaquil',              label: 'Ecuador — GMT−5' },
  { zone: 'America/Caracas',                label: 'Venezuela — GMT−4' },
  { zone: 'America/La_Paz',                 label: 'Bolivia — GMT−4' },
  { zone: 'America/Santiago',               label: 'Chile — GMT−4/−3' },
  { zone: 'America/Argentina/Buenos_Aires', label: 'Argentina — GMT−3' },
  { zone: 'America/Sao_Paulo',              label: 'Brasil — GMT−3' },
  { zone: 'America/Montevideo',             label: 'Uruguay — GMT−3' },
  { zone: 'America/Asuncion',              label: 'Paraguay — GMT−4/−3' },
  { zone: 'Europe/Madrid',                  label: 'España — GMT+1/+2' },
  { zone: 'UTC',                            label: 'UTC — GMT+0' },
]

const TZ_GROUPS: { label: string; zones: string[] }[] = [
  {
    label: 'América Central',
    zones: [
      'America/Costa_Rica', 'America/Guatemala', 'America/El_Salvador',
      'America/Tegucigalpa', 'America/Managua',
    ],
  },
  {
    label: 'América del Norte',
    zones: [
      'America/New_York', 'America/Chicago', 'America/Denver',
      'America/Los_Angeles', 'America/Mexico_City',
    ],
  },
  {
    label: 'América del Sur',
    zones: [
      'America/Bogota', 'America/Lima', 'America/Guayaquil', 'America/Caracas',
      'America/La_Paz', 'America/Santiago', 'America/Argentina/Buenos_Aires',
      'America/Sao_Paulo', 'America/Montevideo', 'America/Asuncion',
    ],
  },
  { label: 'Europa',       zones: ['Europe/Madrid'] },
  { label: 'UTC / Global', zones: ['UTC'] },
]

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const inputCls = cn(
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
  'placeholder:text-gray-400 outline-none transition-colors',
  'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
  'disabled:opacity-50 disabled:cursor-not-allowed',
)
const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400'

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const show = (msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type })
  return { toast, show }
}

function ToastBubble({ toast }: { toast: { msg: string; type: 'ok' | 'err' } }) {
  return (
    <div className={cn(
      'fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium shadow-xl',
      toast.type === 'ok' ? 'bg-green-500 text-white' : 'bg-red-500 text-white',
    )}>
      {toast.type === 'ok' ? <Check size={15} /> : <X size={15} />}
      {toast.msg}
    </div>
  )
}

// ─── Barra de fortaleza de contraseña (siempre visible) ───────────────────────

function pwdStrength(pwd: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pwd) return { score: 0, label: '' }
  let s = 0
  if (pwd.length >= 8) s++
  if (pwd.length >= 12) s++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++
  if (/\d/.test(pwd)) s++
  if (/[^A-Za-z0-9]/.test(pwd)) s++
  const score = Math.min(s, 4) as 0 | 1 | 2 | 3 | 4
  return { score, label: ['', 'Muy débil', 'Débil', 'Regular', 'Fuerte'][score] }
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { score, label } = pwdStrength(password)
  const color     = score <= 1 ? 'bg-red-400' : score === 2 ? 'bg-orange-400' : score === 3 ? 'bg-yellow-400' : 'bg-green-500'
  const textColor = score <= 1 ? 'text-red-500' : score === 2 ? 'text-orange-500' : score === 3 ? 'text-yellow-600' : 'text-green-600'
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-all duration-300',
              i <= score ? color : 'bg-gray-100 dark:bg-slate-700',
            )}
          />
        ))}
      </div>
      {label && <p className={cn('text-[11px] font-medium', textColor)}>{label}</p>}
    </div>
  )
}

// ─── AvatarZone ───────────────────────────────────────────────────────────────

interface AvatarZoneProps {
  displaySrc: string | null
  hasPending: boolean
  pendingDelete: boolean
  onSelect: (f: File) => void
  onMarkForDelete: () => void
  onCancelPending: () => void
  onCancelDelete: () => void
  initials: string
}

function AvatarZone({
  displaySrc, hasPending, pendingDelete,
  onSelect, onMarkForDelete, onCancelPending, onCancelDelete,
  initials,
}: AvatarZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onSelect(f)
    e.target.value = ''
  }

  const hasCurrentAvatar = !!displaySrc && !hasPending

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Círculo de avatar */}
      <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
        <div className="h-24 w-24 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-900/30 ring-4 ring-white dark:ring-slate-900 shadow-md">
          {displaySrc ? (
            <img
              src={displaySrc}
              alt="Avatar"
              className={cn('h-full w-full object-cover transition-opacity', pendingDelete && 'opacity-40 grayscale')}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-primary-600 dark:text-primary-400">
              {initials}
            </div>
          )}
        </div>

        {/* Overlay al hacer hover (solo si no está marcado para borrar) */}
        {!pendingDelete && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={22} className="text-white" />
          </div>
        )}

        {/* Overlay de "marcado para eliminar" */}
        {pendingDelete && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-dashed border-red-400 bg-red-500/10">
            <Trash2 size={20} className="text-red-500" />
          </div>
        )}

        {/* Badge pendiente de nueva imagen */}
        {hasPending && (
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-semibold text-white whitespace-nowrap shadow">
            pendiente
          </div>
        )}
      </div>

      {/* Botones de acción */}
      <div className="flex gap-2 flex-wrap justify-center">
        {!pendingDelete && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            {displaySrc ? 'Cambiar foto' : 'Subir foto'}
          </button>
        )}

        {hasPending && (
          <button
            type="button"
            onClick={onCancelPending}
            className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={12} className="inline mr-0.5 -mt-0.5" />
            Cancelar
          </button>
        )}

        {pendingDelete && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cambiar foto
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={12} className="inline mr-0.5 -mt-0.5" />
              Cancelar eliminación
            </button>
          </>
        )}

        {hasCurrentAvatar && !pendingDelete && (
          <button
            type="button"
            onClick={onMarkForDelete}
            className="rounded-xl border border-red-200 dark:border-red-900 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={13} className="inline mr-0.5 -mt-0.5" />
            Quitar
          </button>
        )}
      </div>

      {pendingDelete && (
        <p className="text-[10px] text-red-400 dark:text-red-400">Se eliminará al guardar</p>
      )}
      {!pendingDelete && (
        <p className="text-[10px] text-gray-400 dark:text-slate-500">JPEG · PNG · WebP · máx 5 MB</p>
      )}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleChange} />
    </div>
  )
}

// ─── ProfileInfoForm ──────────────────────────────────────────────────────────

interface ProfileInfoFormProps {
  pendingAvatarFile: File | null
  pendingDeleteAvatar: boolean
  onAvatarSaved: (blobUrl: string) => void
  onAvatarDeleted: () => void
  onClearPendingAvatar: () => void
}

function ProfileInfoForm({
  pendingAvatarFile, pendingDeleteAvatar,
  onAvatarSaved, onAvatarDeleted, onClearPendingAvatar,
}: ProfileInfoFormProps) {
  const { user, updateUser } = useAuth()

  const resolvedTz = resolveInitialTz(user?.timezone)
  const [name, setName]         = useState(user?.name ?? '')
  const [currency, setCurrency] = useState(user?.currency ?? 'CRC')
  const [timezone, setTimezone] = useState(resolvedTz)
  const [saving, setSaving]     = useState(false)

  // Valores iniciales para detectar cambios pendientes
  const [initial, setInitial] = useState({ name: user?.name ?? '', currency: user?.currency ?? 'CRC', timezone: resolvedTz })

  const { toast, show } = useToast()

  // Sincronizar cuando el perfil se actualiza desde la API
  useEffect(() => {
    if (user) {
      const tz = resolveInitialTz(user.timezone)
      setName(user.name)
      setCurrency(user.currency)
      setTimezone(tz)
      setInitial({ name: user.name, currency: user.currency, timezone: tz })
    }
  }, [user])

  const hasPendingChanges =
    name !== initial.name ||
    currency !== initial.currency ||
    timezone !== initial.timezone ||
    pendingAvatarFile !== null ||
    pendingDeleteAvatar

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      // 1. Eliminar avatar si está marcado para borrar (y no se subió uno nuevo)
      if (pendingDeleteAvatar && !pendingAvatarFile) {
        await userApi.profile.deleteAvatar()
        onAvatarDeleted()
      }

      // 2. Subir avatar pendiente si hay uno seleccionado
      if (pendingAvatarFile) {
        const fileSnap = pendingAvatarFile
        await userApi.profile.uploadAvatar(fileSnap)
        updateUser({ has_avatar: true })
        onAvatarSaved(URL.createObjectURL(fileSnap))
        onClearPendingAvatar()
      }

      // 3. Guardar info del perfil
      const updated = await userApi.profile.update({ name, currency, timezone })
      updateUser({ name: updated.name, currency: updated.currency, timezone: updated.timezone })
      show('Cambios guardados')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Error al guardar', 'err')
    } finally {
      setSaving(false)
    }
  }

  const currencyInfo = CURRENCIES.find(c => c.code === currency)
  const browserTzInList = TIMEZONES.some(t => t.zone === BROWSER_TZ)

  return (
    <form onSubmit={handleSave} className="flex flex-col flex-1 gap-4">
      <div className="flex-1 space-y-4">
        {/* Nombre | Correo — misma fila */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nombre completo <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Tu nombre"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Correo electrónico</label>
            <input
              value={user?.email ?? ''}
              readOnly
              disabled
              className={cn(inputCls, 'bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 select-none')}
            />
          </div>
        </div>

        {/* Moneda | Zona horaria */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Moneda <span className="text-red-500">*</span></label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} required className={inputCls}>
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
            {currencyInfo && (
              <p className="mt-1 text-[11px] text-gray-400">
                {currencyInfo.decimals === 0 ? 'Sin decimales' : '2 decimales'}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Zona horaria <span className="text-red-500">*</span></label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)} required className={inputCls}>
              {BROWSER_TZ && !browserTzInList && (
                <option value={BROWSER_TZ}>{BROWSER_TZ} (detectada)</option>
              )}
              {TZ_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.zones.map(zone => {
                    const tz = TIMEZONES.find(t => t.zone === zone)
                    if (!tz) return null
                    return <option key={zone} value={zone}>{tz.label}</option>
                  })}
                </optgroup>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">
              Detectada: <span className="font-medium text-gray-500 dark:text-slate-400">{BROWSER_TZ}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Fila de acciones — pegada al fondo de la card */}
      <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-800 pt-4">
        {/* Indicador de cambios pendientes */}
        <div className="min-w-0 mr-4">
          {hasPendingChanges && !saving && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle size={13} className="shrink-0" />
              Cambios pendientes de aplicar
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      {toast && <ToastBubble toast={toast} />}
    </form>
  )
}

// ─── PasswordForm ─────────────────────────────────────────────────────────────

function PasswordForm() {
  const [cur, setCur]         = useState('')
  const [next, setNext]       = useState('')
  const [conf, setConf]       = useState('')
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving]   = useState(false)
  const { toast, show } = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== conf) { show('Las contraseñas no coinciden', 'err'); return }
    if (next.length < 8) { show('Mínimo 8 caracteres', 'err'); return }
    setSaving(true)
    try {
      await userApi.profile.changePassword({ current_password: cur, new_password: next })
      setCur(''); setNext(''); setConf('')
      show('Contraseña actualizada')
    } catch (err) { show(err instanceof Error ? err.message : 'Error', 'err') }
    finally { setSaving(false) }
  }

  function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
    return (
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-4">
      <div className="flex-1 space-y-4">
        {/* Contraseña actual */}
        <div>
          <label className={labelCls}>Contraseña actual <span className="text-red-500">*</span></label>
          <div className="relative">
            <input
              type={showCur ? 'text' : 'password'}
              value={cur}
              onChange={e => setCur(e.target.value)}
              required
              placeholder="••••••••"
              className={cn(inputCls, 'pr-10')}
            />
            <EyeToggle visible={showCur} onToggle={() => setShowCur(v => !v)} />
          </div>
        </div>

        {/* Nueva | Confirmar — misma fila */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nueva contraseña <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={next}
                onChange={e => setNext(e.target.value)}
                required
                placeholder="Mínimo 8 caracteres"
                className={cn(inputCls, 'pr-10')}
              />
              <EyeToggle visible={showNew} onToggle={() => setShowNew(v => !v)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Confirmar nueva <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={conf}
                onChange={e => setConf(e.target.value)}
                required
                placeholder="Repetir contraseña"
                className={cn(inputCls, 'pr-10')}
              />
              <EyeToggle visible={showNew} onToggle={() => setShowNew(v => !v)} />
            </div>
          </div>
        </div>

      </div>

      {/* Fondo: fortaleza + info (izq) | botón (der) */}
      <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-800 pt-4">
        <div className="flex-1 min-w-0 mr-6">
          <PasswordStrengthBar password={next} />
          {next && conf && next !== conf && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
              <X size={11} className="shrink-0" />
              Las contraseñas no coinciden
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Actualizando…' : 'Cambiar contraseña'}
        </button>
      </div>

      {toast && <ToastBubble toast={toast} />}
    </form>
  )
}

// ─── NotificationsForm ────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function fmtHour(h: number) {
  return `${String(h).padStart(2, '0')}:00`
}

function NotificationsForm() {
  const { user, updateUser } = useAuth()
  const [enabled, setEnabled] = useState(user?.receive_reminders ?? true)
  const [hour, setHour]       = useState(user?.reminder_hour ?? 8)
  const [saving, setSaving]   = useState(false)
  const { toast, show } = useToast()

  const globallyEnabled = user?.reminders_globally_enabled ?? true
  const tzLabel = TIMEZONES.find(t => t.zone === user?.timezone)?.label ?? user?.timezone ?? 'UTC'

  useEffect(() => {
    if (user) {
      setEnabled(user.receive_reminders ?? true)
      setHour(user.reminder_hour ?? 8)
    }
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await userApi.profile.update({ receive_reminders: enabled, reminder_hour: hour })
      updateUser({ receive_reminders: updated.receive_reminders, reminder_hour: updated.reminder_hour })
      show('Preferencia guardada')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Error al guardar', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col flex-1 gap-4">
      <div className="flex-1 space-y-4">

        {/* Aviso cuando el admin desactivó los recordatorios globalmente */}
        {!globallyEnabled && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
            <BellOff size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              El administrador ha desactivado los recordatorios para todos los usuarios. Tu preferencia se conserva pero no recibirás emails hasta que sean reactivados.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-slate-400">
          Cuando está activo, recibirás un email el día anterior a cada egreso o ingreso con estado <strong>pendiente</strong>, con todos tus compromisos del día siguiente agrupados.
        </p>

        {/* Toggle activar/desactivar */}
        <label className={cn(
          'flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors',
          globallyEnabled
            ? 'border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50'
            : 'border-gray-100 dark:border-slate-800 opacity-60',
        )}>
          <div className="relative mt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="sr-only"
            />
            <div className={cn(
              'h-5 w-9 rounded-full transition-colors',
              enabled ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-700',
            )} />
            <div className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-4' : 'translate-x-0.5',
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-slate-200">
              {enabled
                ? <><Bell size={14} className="text-primary-500" /> Recordatorios activados</>
                : <><BellOff size={14} className="text-gray-400" /> Recordatorios desactivados</>
              }
            </div>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
              {enabled
                ? 'Recibirás un email la noche anterior a cada compromiso pendiente.'
                : 'No recibirás emails de recordatorio aunque el administrador los tenga habilitados.'}
            </p>
          </div>
        </label>

        {/* Selector de hora */}
        <div className={cn('transition-opacity', (!enabled || !globallyEnabled) && 'opacity-40 pointer-events-none')}>
          <label className={labelCls}>Hora de envío</label>
          <select
            value={hour}
            onChange={e => setHour(Number(e.target.value))}
            disabled={!enabled || !globallyEnabled}
            className={inputCls}
          >
            {HOURS.map(h => (
              <option key={h} value={h}>{fmtHour(h)}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
            Zona horaria: <span className="font-medium text-gray-500 dark:text-slate-400">{tzLabel}</span>
          </p>
        </div>
      </div>

      <div className="flex justify-end border-t border-gray-100 dark:border-slate-800 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Guardando…' : 'Guardar preferencia'}
        </button>
      </div>

      {toast && <ToastBubble toast={toast} />}
    </form>
  )
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, updateUser } = useAuth()
  const { setAvatarBlobUrl } = useUserStore()
  const currentAvatarUrl = useAvatarUrl()

  // Estado del avatar pendiente
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const [pendingDeleteAvatar, setPendingDeleteAvatar] = useState(false)

  function handleAvatarSelect(file: File) {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingAvatarFile(file)
    setPendingPreviewUrl(URL.createObjectURL(file))
    setPendingDeleteAvatar(false) // Cancelar borrado si se selecciona nueva imagen
  }

  function handleCancelPending() {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingAvatarFile(null)
    setPendingPreviewUrl(null)
  }

  function handleMarkForDelete() {
    // Cancelar cualquier subida pendiente y marcar para borrar
    handleCancelPending()
    setPendingDeleteAvatar(true)
  }

  function handleCancelDelete() {
    setPendingDeleteAvatar(false)
  }

  function handleAvatarSaved(blobUrl: string) {
    setAvatarBlobUrl(blobUrl)
  }

  function handleAvatarDeleted() {
    setAvatarBlobUrl(null)
    updateUser({ has_avatar: false })
    setPendingDeleteAvatar(false)
  }

  const initials = user?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? '?'
  const tzLabel  = TIMEZONES.find(t => t.zone === user?.timezone)?.label ?? user?.timezone ?? '—'
  const currLabel = CURRENCIES.find(c => c.code === user?.currency)?.name ?? user?.currency ?? '—'

  // La preview pendiente tiene prioridad sobre el avatar guardado
  const displaySrc = pendingPreviewUrl ?? currentAvatarUrl

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Mi perfil</h1>

      {/* Header con avatar + resumen */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary-400 to-primary-600 dark:from-primary-700 dark:to-primary-900" />

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-5 px-8 pb-6 -mt-12">
          <AvatarZone
            displaySrc={displaySrc}
            hasPending={pendingPreviewUrl !== null}
            pendingDelete={pendingDeleteAvatar}
            onSelect={handleAvatarSelect}
            onMarkForDelete={handleMarkForDelete}
            onCancelPending={handleCancelPending}
            onCancelDelete={handleCancelDelete}
            initials={initials}
          />
          <div className="sm:mb-1 flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 truncate">{user?.name}</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{user?.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-400">
                {user?.currency} — {currLabel}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-slate-400">
                {tzLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Dos columnas con flex-col para anclar botones al fondo */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-soft flex flex-col">
          <h3 className="mb-5 text-sm font-semibold text-gray-800 dark:text-slate-200">Información personal</h3>
          <ProfileInfoForm
            pendingAvatarFile={pendingAvatarFile}
            pendingDeleteAvatar={pendingDeleteAvatar}
            onAvatarSaved={handleAvatarSaved}
            onAvatarDeleted={handleAvatarDeleted}
            onClearPendingAvatar={handleCancelPending}
          />
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-soft flex flex-col">
          <h3 className="mb-5 text-sm font-semibold text-gray-800 dark:text-slate-200">Seguridad</h3>
          <PasswordForm />
        </div>
      </div>

      {/* Notificaciones */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-soft flex flex-col">
        <h3 className="mb-5 text-sm font-semibold text-gray-800 dark:text-slate-200">Notificaciones</h3>
        <NotificationsForm />
      </div>
    </div>
  )
}
