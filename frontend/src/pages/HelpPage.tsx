import { useMemo, useState, type ElementType } from 'react'
import {
  CalendarRange, ChevronDown, CircleHelp, FileText, Gauge, LayoutDashboard,
  Settings2, ShoppingCart, Wallet, Bell, Repeat2, UserRound, Plug, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import imgAbrirPeriodo from '@/assets/help/abrir-periodo-modal.png'
import imgDashboard from '@/assets/help/dashboard.png'
import imgIngresos from '@/assets/help/ingresos.png'
import imgEgresos from '@/assets/help/egresos.png'
import imgCatalogos from '@/assets/help/catalogos.png'
import imgPeriodos from '@/assets/help/periodos.png'
import imgReabrirPeriodo from '@/assets/help/reabrir-periodo-modal.png'
import imgReportes from '@/assets/help/reporte-comparacion.png'
import imgForgotPassword from '@/assets/help/forgot-password.png'
import imgPerfil from '@/assets/help/perfil.png'
import imgAboutModal from '@/assets/help/about-modal.png'
import imgPerfilNotificaciones from '@/assets/help/perfil-notificaciones.png'
import imgReportePdfPreview from '@/assets/help/reporte-pdf-preview.png'
import imgVincularCanal from '@/assets/help/vincular-canal-modal.png'
import imgResponsableObviable from '@/assets/help/responsable-obviable-form.png'

type Guide = {
  id: string
  title: string
  summary: string
  image: string
  steps: string[]
  chips: string[]
}

type Faq = {
  q: string
  a: string
  image?: string
  module: string
}

const GUIDES: Guide[] = [
  {
    id: 'periodo',
    title: '1. Abrir un período',
    summary: 'Todo el sistema parte aquí. Sin un período abierto no debes registrar movimientos.',
    image: imgAbrirPeriodo,
    chips: ['Inicio', 'Obligatorio'],
    steps: [
      'Ve a Períodos en el menú lateral.',
      'Pulsa Abrir período.',
      'Confirma el mes que te propone el sistema o selecciona el primer mes disponible.',
      'Usa este paso antes de registrar ingresos, egresos o listas de compra.',
    ],
  },
  {
    id: 'dashboard',
    title: '2. Leer el tablero',
    summary: 'El dashboard resume lo que pasa dentro del período activo.',
    image: imgDashboard,
    chips: ['Resumen', 'Lectura'],
    steps: [
      'Revisa el período activo en la parte superior.',
      'Mira los totales de ingresos, egresos saldados, egresos pendientes y dinero libre.',
      'Usa los gráficos para detectar categorías o responsables que concentran más gasto.',
      'Toma el dashboard como punto de control antes de seguir registrando movimientos.',
    ],
  },
  {
    id: 'ingresos',
    title: '3. Registrar ingresos',
    summary: 'Los ingresos se capturan cuando el período ya está abierto.',
    image: imgIngresos,
    chips: ['Movimientos', 'Cobros'],
    steps: [
      'Entra a Ingresos desde el menú lateral.',
      'Pulsa Nuevo ingreso.',
      'Completa fecha, monto, descripción, tipo y responsable.',
      'Marca si está recibido o pendiente y guarda el movimiento.',
    ],
  },
  {
    id: 'egresos',
    title: '4. Registrar egresos',
    summary: 'Los egresos siguen el mismo orden de trabajo, pero con categoría, pago y obviable.',
    image: imgEgresos,
    chips: ['Gastos', 'Estados'],
    steps: [
      'Entra a Egresos con el período abierto.',
      'Pulsa Nuevo egreso.',
      'Completa fecha, monto, categoría, descripción y responsable.',
      'Define el estado de pago y si el egreso es recurrente o puntual.',
    ],
  },
  {
    id: 'catalogos',
    title: '5. Preparar catálogos',
    summary: 'Las categorías y tipos ayudan a ordenar la información antes de trabajar a escala.',
    image: imgCatalogos,
    chips: ['Catálogos', 'Base'],
    steps: [
      'Ve a Catálogos para revisar categorías de egresos y tipos de ingreso.',
      'Crea los valores que vas a reutilizar en el registro diario.',
      'Mantén una nomenclatura clara para que reportes y filtros sean más consistentes.',
      'Si vas a usar responsables recurrentes, procura que los nombres sean estables y breves.',
    ],
  },
  {
    id: 'listas',
    title: '6. Trabajar con listas de compra',
    summary: 'La lista se arma antes de enviarla a egreso y después se puede seguir ajustando.',
    image: imgEgresos,
    chips: ['Compras', 'Egreso'],
    steps: [
      'Entra a Listas de compra y crea una nueva lista.',
      'Agrega productos uno por uno con cantidad, valor unitario y observación si hace falta.',
      'Marca los productos comprados y envía la lista a egreso.',
      'Si agregas más productos después, vuelve a enviarla para actualizar el egreso existente.',
    ],
  },
  {
    id: 'cierre',
    title: '7. Cerrar y reabrir períodos',
    summary: 'El cierre consolida el mes y la reapertura sirve para correcciones puntuales.',
    image: imgPeriodos,
    chips: ['Cierre', 'Reapertura'],
    steps: [
      'Cuando el mes esté completo, vuelve a Períodos.',
      'Expande la tarjeta del período para ver Cerrar período o Reabrir si ya está cerrado.',
      'Al cerrar, el sistema genera el reporte y prepara el siguiente período disponible.',
      'Al reabrir, haces correcciones y luego vuelves a cerrar.',
    ],
  },
  {
    id: 'reportes',
    title: '8. Revisar reportes',
    summary: 'Los reportes muestran comparación, tendencia y desglose por categoría.',
    image: imgReportes,
    chips: ['Análisis', 'PDF'],
    steps: [
      'Abre Reportes desde el menú lateral.',
      'Usa Comparación para contrastar períodos.',
      'Usa Tendencia para ver evolución mes a mes.',
      'Usa Por categoría para revisar en qué se está yendo el gasto.',
    ],
  },
  {
    id: 'perfil',
    title: '9. Configurar perfil',
    summary: 'Desde Perfil se ajustan datos personales, seguridad y notificaciones.',
    image: imgPerfil,
    chips: ['Perfil', 'Seguridad'],
    steps: [
      'Haz clic en tu nombre en el menú lateral.',
      'Actualiza nombre, moneda, zona horaria y avatar si corresponde.',
      'Cambia tu contraseña en la sección Seguridad.',
      'Activa o desactiva recordatorios y fija la hora de notificación.',
    ],
  },
  {
    id: 'integraciones',
    title: '10. Vincular Telegram o WhatsApp',
    summary: 'Permite registrar egresos enviando la foto de un recibo por chat, sin abrir la aplicación.',
    image: imgVincularCanal,
    chips: ['Integraciones', 'Opcional'],
    steps: [
      'Ve a Integraciones en el menú lateral.',
      'Pulsa Vincular Telegram o Vincular WhatsApp, según el canal que quieras usar.',
      'Copia el código de 8 caracteres que aparece — es válido por 10 minutos y de un solo uso.',
      'Envía ese código como mensaje al bot desde tu WhatsApp o Telegram.',
      'La ventana detecta el vínculo sola y se cierra — desde ese momento, cualquier foto de recibo que envíes por ese canal se registra como un egreso en borrador, pendiente de tu confirmación.',
      'Puedes desvincular el canal en cualquier momento desde la misma pantalla.',
    ],
  },
]

const FAQS: Faq[] = [
  {
    q: '¿Cómo recupero mi contraseña si la olvidé?',
    a: 'En la pantalla de inicio pulsa ¿Olvidaste tu contraseña?, ingresa tu correo, valida el código de 6 dígitos y define una nueva clave.',
    image: imgForgotPassword,
    module: 'Acceso',
  },
  {
    q: '¿Qué pasa cuando cierro un período?',
    a: 'El mes queda consolidado, se genera el reporte PDF y se prepara el siguiente período operativo. Los movimientos pendientes pueden arrastrarse según su estado.',
    image: imgReportePdfPreview,
    module: 'Períodos',
  },
  {
    q: '¿Qué pasa si reabro un período?',
    a: 'Se habilita nuevamente ese mes para correcciones. Luego puedes volver a cerrarlo y regenerar el resumen mensual.',
    image: imgReabrirPeriodo,
    module: 'Períodos',
  },
  {
    q: '¿Cómo activo los recordatorios diarios?',
    a: 'En Mi perfil, sección Notificaciones, activa el interruptor y define la hora. Recibirás avisos para movimientos pendientes del día siguiente.',
    image: imgPerfilNotificaciones,
    module: 'Perfil',
  },
  {
    q: '¿Puedo asignar un responsable a cada movimiento?',
    a: 'Sí. Responsable es una etiqueta opcional que ayuda a filtrar y a entender quién administra o genera cada registro.',
    image: imgResponsableObviable,
    module: 'Movimientos',
  },
  {
    q: '¿Qué significa marcar un egreso como obviable?',
    a: 'Sirve para identificar gastos que no quieres considerar en ciertos totales o resúmenes. Puedes activarlo al crear o editar un egreso.',
    image: imgResponsableObviable,
    module: 'Movimientos',
  },
  {
    q: '¿Dónde veo la versión y el resumen de la aplicación?',
    a: 'En el modal Acerca de ControlGastos, accesible desde el logo o el nombre de la aplicación en el menú lateral.',
    image: imgAboutModal,
    module: 'Sistema',
  },
  {
    q: '¿Puedo registrar un egreso enviando una foto por WhatsApp o Telegram?',
    a: 'Sí. En Integraciones vinculas el canal una sola vez con un código de un solo uso. Después, cada foto de recibo que envíes por ese chat se registra como egreso en borrador — revisa el monto y la categoría propuestos y confírmalo desde Egresos.',
    image: imgVincularCanal,
    module: 'Integraciones',
  },
]

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
            {index + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

function GuideBadge({ id }: { id: string }) {
  const map: Record<string, ElementType> = {
    periodo: CalendarRange,
    dashboard: LayoutDashboard,
    ingresos: Wallet,
    egresos: ShoppingCart,
    catalogos: Settings2,
    listas: Repeat2,
    cierre: FileText,
    reportes: Gauge,
    perfil: UserRound,
    integraciones: Plug,
  }
  const Icon = map[id] ?? CircleHelp
  return <Icon size={16} />
}

function GuideCard({ guide, open, onToggle }: { guide: Guide; open: boolean; onToggle: () => void }) {
  return (
    <article id={guide.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 p-6 text-left"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            {guide.chips.map(chip => (
              <span key={chip} className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                {chip}
              </span>
            ))}
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">{guide.title}</h3>
          <p className="text-sm leading-relaxed text-gray-500 dark:text-slate-400">{guide.summary}</p>
        </div>
        <ChevronDown size={18} className={cn('shrink-0 text-gray-400 transition-transform duration-300 dark:text-slate-500', open && 'rotate-180')} />
      </button>

      {/* Mismo truco grid-rows 0fr→1fr que en FAQ: anima a altura "auto" sin medir contenido */}
      <div className={cn('grid transition-all duration-300 ease-in-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <img src={guide.image} alt={guide.title} className="h-56 w-full border-y border-gray-100 object-cover dark:border-slate-800" />
          <div className="p-6">
            <StepList steps={guide.steps} />
          </div>
        </div>
      </div>
    </article>
  )
}

function FaqItem({ faq }: { faq: Faq }) {
  const [open, setOpen] = useState(false)

  return (
    <article className="border-b border-gray-100 last:border-0 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-start justify-between gap-4 py-4 text-left"
      >
        <span className="min-w-0">
          <span className="mb-1 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500 dark:bg-slate-800 dark:text-slate-400">
            {faq.module}
          </span>
          <span className="block text-sm font-medium text-gray-800 dark:text-slate-200">{faq.q}</span>
        </span>
        <ChevronDown size={16} className={cn('mt-1 shrink-0 text-gray-400 transition-transform duration-300 dark:text-slate-500', open && 'rotate-180')} />
      </button>

      {/* Truco grid-rows 0fr→1fr: anima a altura "auto" sin JS ni medir el contenido */}
      <div className={cn('grid transition-all duration-300 ease-in-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <div className="relative mb-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 pr-11 dark:border-slate-800 dark:bg-slate-950/40">
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Cerrar"
              aria-label="Cerrar respuesta"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
            >
              <X size={14} />
            </button>
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-gray-500 dark:text-slate-400">{faq.a}</p>
              {faq.image && (
                <img
                  src={faq.image}
                  alt={faq.q}
                  className="w-full rounded-2xl border border-gray-100 object-cover dark:border-slate-800"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

export function HelpPage() {
  const [openGuideId, setOpenGuideId] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const allTags = useMemo(
    () => Array.from(new Set(GUIDES.flatMap(guide => guide.chips))),
    [],
  )

  const filteredTopics = useMemo(() => {
    if (!activeTag) return GUIDES
    return GUIDES.filter(guide => guide.chips.includes(activeTag))
  }, [activeTag])

  function openGuide(id: string) {
    setActiveTag(null)
    setOpenGuideId(id)
    // Espera al frame siguiente para que el acordeón ya esté expandido
    // (altura final) antes de hacer scroll, si no el cálculo queda corto.
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function toggleTag(tag: string) {
    setOpenGuideId(null)
    setActiveTag(prev => prev === tag ? null : tag)
  }

  // "Guías paso a paso" arranca vacía — solo muestra contenido cuando se
  // eligió un tópico puntual o se filtró por etiqueta.
  const stepGuides = useMemo(() => {
    if (openGuideId) return GUIDES.filter(guide => guide.id === openGuideId)
    if (activeTag) return GUIDES.filter(guide => guide.chips.includes(activeTag))
    return []
  }, [openGuideId, activeTag])

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-3xl border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
          <CircleHelp size={14} />
          Centro de ayuda
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-100 sm:text-4xl">
            Guías operativas ordenadas por flujo real de trabajo
          </h1>
          <p className="text-sm leading-7 text-gray-500 dark:text-slate-400">
            Esta versión reorganiza la ayuda para enseñar primero lo que necesitas habilitar, luego lo que debes registrar,
            y al final cómo cerrar, revisar y corregir. Las imágenes se mantienen como apoyo visual.
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            Tópicos
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Cada bloque explica qué hacer, cómo hacerlo y qué orden seguir. Pulsa uno para abrirlo abajo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={cn(
                'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                activeTag === tag
                  ? 'bg-primary-500 text-white'
                  : 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-400 dark:hover:bg-primary-900/50',
              )}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTopics.map(guide => (
            <button
              key={guide.id}
              type="button"
              onClick={() => openGuide(guide.id)}
              className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-left transition-colors hover:border-primary-200 hover:bg-primary-50 dark:border-slate-800 dark:bg-slate-950/30 dark:hover:border-primary-900/40 dark:hover:bg-primary-900/20"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                  <GuideBadge id={guide.id} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{guide.title}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-slate-400">{guide.chips.join(' · ')}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            Guías paso a paso
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Cada guía sigue un orden lógico de uso. Si un paso depende de otro, ese requisito aparece primero.
          </p>
        </div>

        <div className="grid gap-6">
          {stepGuides.length > 0 ? (
            stepGuides.map(guide => (
              <GuideCard
                key={guide.id}
                guide={guide}
                open={openGuideId === guide.id}
                onToggle={() => setOpenGuideId(prev => prev === guide.id ? null : guide.id)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-soft dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              Selecciona un tópico o una etiqueta arriba para ver su guía paso a paso.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              Preguntas frecuentes
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Respuestas cortas y directas para consultas de uso frecuente.
            </p>
          </div>
          <div className="px-6">
            {FAQS.map(faq => <FaqItem key={faq.q} faq={faq} />)}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Orden sugerido para enseñar el sistema</h3>
            <div className="mt-4 space-y-3">
              {[
                'Abrir período.',
                'Leer el dashboard.',
                'Registrar ingresos y egresos.',
                'Trabajar listas de compra.',
                'Cerrar o reabrir períodos.',
                'Revisar reportes.',
                'Ajustar perfil, avatar, contraseña y recordatorios.',
                'Vincular Telegram o WhatsApp si quieres registrar egresos por chat.',
              ].map((item, index) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-gray-50 px-4 py-3 dark:bg-slate-950/30">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-gray-600 dark:text-slate-300">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-start gap-3">
              <Bell size={18} className="mt-0.5 text-primary-500" />
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Criterio de edición</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-slate-400">
                  Si una explicación depende de una condición previa, esa condición debe aparecer antes. Esto evita enseñar
                  a registrar egresos antes de abrir un período, o a usar reportes antes de tener datos cargados.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
