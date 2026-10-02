import { useState, useEffect, useRef } from 'react'
import { Send, MessageCircle, Unlink, Copy, Check } from 'lucide-react'
import { userApi, type ChannelLink, type Channel } from '@/lib/userApi'
import { cn } from '@/lib/utils'

const CHANNEL_META: Record<Channel, { label: string; icon: React.ElementType; color: string }> = {
  telegram: { label: 'Telegram', icon: Send,          color: 'text-sky-500' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-green-500' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

// ─── Modal: generar código y esperar a que se vincule ─────────────────────────

function LinkCodeModal({ channel, onClose, onLinked }: {
  channel: Channel
  onClose: () => void
  onLinked: () => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [linked, setLinked] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let active = true
    userApi.channels.createCode(channel)
      .then(r => { if (active) { setCode(r.code); setExpiresAt(r.expires_at) } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Error') })

    // Mientras el modal está abierto, revisa cada 3s si ya se completó el
    // vínculo (n8n llamó a /channels/link con el código) para cerrar solo.
    pollRef.current = setInterval(async () => {
      try {
        const links = await userApi.channels.list()
        if (links.some(l => l.channel === channel)) {
          setLinked(true)
          if (pollRef.current) clearInterval(pollRef.current)
          setTimeout(onLinked, 1200)
        }
      } catch { /* ignora fallos de polling, reintenta en el próximo ciclo */ }
    }, 3000)

    return () => {
      active = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [channel, onLinked])

  const meta = CHANNEL_META[channel]

  function copyCode() {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Vincular {meta.label}</h3>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {linked ? (
          <div className="mt-4 flex flex-col items-center gap-2 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">
              <Check size={20} />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">¡Vinculado!</p>
          </div>
        ) : code ? (
          <>
            <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
              Envía este código por {meta.label} a nuestro bot para vincular tu cuenta:
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-3 text-center font-mono text-lg font-semibold tracking-widest text-gray-900 dark:text-slate-100">
                {code}
              </span>
              <button
                onClick={copyCode}
                title="Copiar"
                className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
              Válido por 10 minutos{expiresAt ? ` (hasta las ${fmtTime(expiresAt)})` : ''}. Esta ventana se cierra
              sola apenas detectemos que quedó vinculado.
            </p>
          </>
        ) : !error && (
          <div className="mt-4 flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        )}

        <div className="mt-5">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function IntegrationsPage() {
  const [links, setLinks] = useState<ChannelLink[]>([])
  const [loading, setLoading] = useState(true)
  const [linkingChannel, setLinkingChannel] = useState<Channel | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<ChannelLink | null>(null)

  async function load() {
    setLoading(true)
    try {
      setLinks(await userApi.channels.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleUnlink(link: ChannelLink) {
    await userApi.channels.unlink(link.id)
    setLinks(prev => prev.filter(l => l.id !== link.id))
    setUnlinkTarget(null)
  }

  const linkedByChannel = new Map(links.map(l => [l.channel, l]))

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Integraciones</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Vincula WhatsApp o Telegram para registrar egresos enviando una foto del recibo por chat.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(['telegram', 'whatsapp'] as Channel[]).map(channel => {
          const meta = CHANNEL_META[channel]
          const Icon = meta.icon
          const link = linkedByChannel.get(channel)
          return (
            <div key={channel} className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 dark:bg-slate-800', meta.color)}>
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-slate-100">{meta.label}</p>
                  {link ? (
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                      {link.label || link.channel_id} · vinculado {fmtDate(link.linked_at)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-slate-500">No vinculado</p>
                  )}
                </div>
              </div>
              <div className="mt-4">
                {link ? (
                  <button
                    onClick={() => setUnlinkTarget(link)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Unlink size={14} /> Desvincular
                  </button>
                ) : (
                  <button
                    onClick={() => setLinkingChannel(channel)}
                    className="w-full rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
                  >
                    Vincular {meta.label}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {linkingChannel && (
        <LinkCodeModal
          channel={linkingChannel}
          onClose={() => setLinkingChannel(null)}
          onLinked={() => { setLinkingChannel(null); load() }}
        />
      )}

      {unlinkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setUnlinkTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
              Desvincular {CHANNEL_META[unlinkTarget.channel].label}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Ya no vas a poder enviar recibos por este canal hasta que vuelvas a vincularlo.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setUnlinkTarget(null)}
                className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUnlink(unlinkTarget)}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
              >
                Desvincular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
