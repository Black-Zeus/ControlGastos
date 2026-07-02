import { useEffect, useState, useCallback } from 'react'
import {
  Mail, Server, User, Lock, AtSign, ShieldCheck,
  Save, Send, CheckCircle, AlertCircle, Loader2, RefreshCw, Globe, Search, Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminApi, type SmtpSettings, type EmailLog, type GeneralSettings, type ReminderSettings } from '@/lib/adminApi'

// ─── helpers ──────────────────────────────────────────────────────────────────

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10)
}

function defaultDateFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 15)
  return toDateInputValue(d)
}

function defaultDateTo() {
  return toDateInputValue(new Date())
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(iso))
}

// ─── Campo de formulario ──────────────────────────────────────────────────────

function Field({
  label, icon: Icon, children,
}: {
  label: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-300">
        <Icon size={13} className="text-gray-400 dark:text-slate-500" />
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 ' +
  'px-3 py-2 text-sm text-gray-900 dark:text-slate-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-gray-400 dark:placeholder:text-slate-500'

// ─── Página ───────────────────────────────────────────────────────────────────

export function AdminSettingsPage() {
  // SMTP
  const [form, setForm] = useState<SmtpSettings>({
    smtp_host: '', smtp_port: 587, smtp_user: '',
    smtp_password: '', smtp_from: '', smtp_use_tls: true,
  })
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [testing, setTesting]     = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [toast, setToast]         = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // General
  const [general, setGeneral]       = useState<GeneralSettings>({ site_url: '' })
  const [savingGen, setSavingGen]   = useState(false)

  // Reminder
  const [reminder, setReminder]         = useState<ReminderSettings>({ enabled: true })
  const [savingReminder, setSavingReminder] = useState(false)
  const [testingReminder, setTestingReminder] = useState(false)

  // Email logs
  const [logs, setLogs]             = useState<EmailLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [dateFrom, setDateFrom]     = useState(defaultDateFrom)
  const [dateTo, setDateTo]         = useState(defaultDateTo)
  const [recipient, setRecipient]   = useState('')

  useEffect(() => {
    Promise.all([
      adminApi.settings.smtp.get(),
      adminApi.settings.general.get(),
      adminApi.settings.reminder.get(),
    ]).then(([smtp, gen, rem]) => {
      setForm(smtp)
      setGeneral(gen)
      setReminder(rem)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const loadLogs = useCallback(async (params?: { date_from?: string; date_to?: string; recipient?: string }) => {
    setLogsLoading(true)
    try {
      setLogs(await adminApi.emailLogs.list(params ?? { date_from: dateFrom, date_to: dateTo, recipient: recipient || undefined }))
    } catch { /* silencioso */ }
    finally { setLogsLoading(false) }
  }, [dateFrom, dateTo, recipient])

  useEffect(() => { loadLogs() }, [loadLogs])

  function set(key: keyof SmtpSettings, value: string | number | boolean) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await adminApi.settings.smtp.update(form)
      setForm(updated)
      showToast('ok', 'Configuración SMTP guardada correctamente')
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveGeneral(e: React.FormEvent) {
    e.preventDefault()
    setSavingGen(true)
    try {
      const updated = await adminApi.settings.general.update(general)
      setGeneral(updated)
      showToast('ok', 'URL del sitio guardada')
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingGen(false)
    }
  }

  async function handleSaveReminder(e: React.FormEvent) {
    e.preventDefault()
    setSavingReminder(true)
    try {
      const updated = await adminApi.settings.reminder.update(reminder)
      setReminder(updated)
      showToast('ok', 'Configuración de recordatorios guardada')
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingReminder(false)
    }
  }

  async function handleTestReminder() {
    setTestingReminder(true)
    try {
      await adminApi.settings.reminder.test()
      showToast('ok', 'Recordatorio en ejecución — revisa el log de envíos en unos segundos')
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al ejecutar')
    } finally {
      setTestingReminder(false)
      loadLogs()
    }
  }

  async function handleTest() {
    if (!testEmail) return
    setTesting(true)
    try {
      await adminApi.settings.smtp.test(testEmail)
      showToast('ok', `Email de prueba enviado a ${testEmail}`)
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setTesting(false)
      loadLogs()
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault()
    loadLogs({ date_from: dateFrom, date_to: dateTo, recipient: recipient || undefined })
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Configuración</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Parámetros globales del sistema</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={cn(
          'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm',
          toast.type === 'ok'
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400',
        )}>
          {toast.type === 'ok'
            ? <CheckCircle size={15} className="shrink-0" />
            : <AlertCircle size={15} className="shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Fila superior — General + SMTP */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* General — URL del sitio */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 px-5 py-4">
            <Globe size={15} className="text-gray-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">General</h2>
          </div>
          <form onSubmit={handleSaveGeneral} className="space-y-4 p-5">
            <Field label="URL del sitio" icon={Globe}>
              <input
                type="url"
                value={general.site_url}
                onChange={e => setGeneral(g => ({ ...g, site_url: e.target.value }))}
                placeholder="https://app.example.com"
                className={inputCls}
              />
            </Field>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Usada para construir enlaces en emails (recuperación de contraseña, bienvenida, etc.)
            </p>
            <div className="pt-1">
              <button
                type="submit"
                disabled={savingGen}
                className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {savingGen ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {savingGen ? 'Guardando…' : 'Guardar URL'}
              </button>
            </div>
          </form>
        </div>

        {/* SMTP form — ocupa 2 columnas */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 px-5 py-4">
            <Mail size={15} className="text-gray-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Configuración SMTP</h2>
          </div>

          <form onSubmit={handleSave} className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Servidor SMTP" icon={Server}>
                <input
                  type="text"
                  value={form.smtp_host}
                  onChange={e => set('smtp_host', e.target.value)}
                  placeholder="smtp.example.com"
                  className={inputCls}
                />
              </Field>
              <Field label="Puerto" icon={Server}>
                <input
                  type="number"
                  value={form.smtp_port}
                  onChange={e => set('smtp_port', Number(e.target.value))}
                  placeholder="587"
                  min={1}
                  max={65535}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Usuario" icon={User}>
                <input
                  type="text"
                  value={form.smtp_user}
                  onChange={e => set('smtp_user', e.target.value)}
                  placeholder="usuario@example.com"
                  className={inputCls}
                />
              </Field>
              <Field label="Contraseña" icon={Lock}>
                <input
                  type="password"
                  value={form.smtp_password}
                  onChange={e => set('smtp_password', e.target.value)}
                  placeholder="••••••••"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Dirección remitente (From)" icon={AtSign}>
              <input
                type="email"
                value={form.smtp_from}
                onChange={e => set('smtp_from', e.target.value)}
                placeholder="noreply@example.com"
                className={inputCls}
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-3">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={form.smtp_use_tls}
                  onChange={e => set('smtp_use_tls', e.target.checked)}
                  className="sr-only"
                />
                <div className={cn(
                  'h-5 w-9 rounded-full transition-colors',
                  form.smtp_use_tls ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-700',
                )} />
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  form.smtp_use_tls ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </div>
              <div>
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-slate-300">
                  <ShieldCheck size={13} className="text-gray-400" />
                  Usar TLS / STARTTLS
                </span>
                <p className="text-xs text-gray-400 dark:text-slate-500">Recomendado para producción. Puerto 465 usa SSL directo.</p>
              </div>
            </label>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Recordatorios diarios */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 px-5 py-4">
          <Bell size={15} className="text-gray-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Recordatorios diarios</h2>
        </div>
        <form onSubmit={handleSaveReminder} className="p-5">
          <p className="mb-4 text-xs text-gray-500 dark:text-slate-400">
            Envía un email a cada usuario el día anterior a un egreso o ingreso pendiente,
            agrupando todos sus compromisos del día siguiente. Cada usuario configura su propia hora de envío en su perfil.
          </p>
          <div className="flex flex-wrap items-center gap-6">
            {/* Toggle activo/inactivo */}
            <label className="flex cursor-pointer items-center gap-3">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={reminder.enabled}
                  onChange={e => setReminder(r => ({ ...r, enabled: e.target.checked }))}
                  className="sr-only"
                />
                <div className={cn(
                  'h-5 w-9 rounded-full transition-colors',
                  reminder.enabled ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-700',
                )} />
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  reminder.enabled ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                {reminder.enabled ? 'Activado globalmente' : 'Desactivado globalmente'}
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingReminder}
              className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              {savingReminder ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {savingReminder ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={handleTestReminder}
              disabled={testingReminder || !reminder.enabled}
              className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors"
            >
              {testingReminder ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {testingReminder ? 'Ejecutando…' : 'Ejecutar ahora'}
            </button>
            {!reminder.enabled && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Activa los recordatorios para poder ejecutar la prueba.</p>
            )}
          </div>
        </form>
      </div>

      {/* Fila inferior — Test email + Mailpit */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Test email */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 px-5 py-4">
            <Send size={15} className="text-gray-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Email de prueba</h2>
          </div>
          <div className="p-5">
            <p className="mb-3 text-xs text-gray-500 dark:text-slate-400">
              Verifica la configuración enviando un email de prueba.
            </p>
            <div className="flex gap-3">
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="destinatario@example.com"
                className={cn(inputCls, 'flex-1')}
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !testEmail || !form.smtp_host}
                className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {testing ? 'Enviando…' : 'Probar'}
              </button>
            </div>
            {!form.smtp_host && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Configura y guarda el servidor SMTP antes de probar.</p>
            )}
          </div>
        </div>

        {/* Mailpit info */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 px-5 py-4">
            <Mail size={15} className="text-gray-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Mailpit — Dev</h2>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Para pruebas locales configura el SMTP con estos valores:
            </p>
            <div className="rounded-lg bg-gray-50 dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
              {[
                ['Servidor', 'mailpit'],
                ['Puerto', '1025'],
                ['Usuario', '(vacío)'],
                ['Contraseña', '(vacía)'],
                ['TLS', 'desactivado'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-3 py-2 text-xs">
                  <span className="text-gray-500 dark:text-slate-400">{k}</span>
                  <code className="font-mono text-gray-800 dark:text-slate-200">{v}</code>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Bandeja de entrada: <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="text-primary-500 hover:underline">localhost:8025</a>
            </p>
          </div>
        </div>

      </div>

      {/* Log de envíos */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-gray-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Log de envíos</h2>
            {logs.length > 0 && (
              <span className="rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                {logs.length}
              </span>
            )}
          </div>

          {/* Filtros */}
          <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
              Desde
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
              Hasta
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </label>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="Destinatario"
                className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 pl-6 pr-3 text-xs text-gray-700 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <button
              type="submit"
              disabled={logsLoading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} />
              Buscar
            </button>
          </form>
        </div>

        {logsLoading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-gray-300 dark:text-slate-600" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400 dark:text-slate-500">Sin envíos en el período seleccionado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">Fecha y hora</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-slate-400">Destinatario</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-slate-400">Asunto</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {fmtDate(log.sent_at)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300">{log.to_email}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-slate-400 max-w-xs truncate" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {log.status === 'ok' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/20 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-400">
                          <CheckCircle size={10} /> OK
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400 cursor-help"
                          title={log.error_msg ?? undefined}
                        >
                          <AlertCircle size={10} /> Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
