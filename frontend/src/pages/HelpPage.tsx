import { useMemo, useState, type ElementType } from 'react'
import {
  ArrowRight, CalendarRange, ChevronDown, CircleHelp, FileText, Gauge, LayoutDashboard,
  Search, Settings2, ShoppingCart, ShieldCheck, Wallet, Bell, Repeat2, UserRound,
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
    module: 'Movimientos',
  },
  {
    q: '¿Qué significa marcar un egreso como obviable?',
    a: 'Sirve para identificar gastos que no quieres considerar en ciertos totales o resúmenes. Puedes activarlo al crear o editar un egreso.',
    module: 'Movimientos',
  },
  {
    q: '¿Dónde veo la versión y el resumen de la aplicación?',
    a: 'En el modal Acerca de ControlGastos, accesible desde el logo o el nombre de la aplicación en el menú lateral.',
    image: imgAboutModal,
    module: 'Sistema',
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
  }
  const Icon = map[id] ?? CircleHelp
  return <Icon size={16} />
}

function GuideCard({ guide }: { guide: Guide }) {
  return (
    <article id={guide.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <img src={guide.image} alt={guide.title} className="h-56 w-full border-b border-gray-100 object-cover dark:border-slate-800" />
      <div className="space-y-4 p-6">
        <div className="space-y-2">
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
        <StepList steps={guide.steps} />
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
        <ChevronDown size={16} className={cn('mt-1 shrink-0 text-gray-400 transition-transform dark:text-slate-500', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 pb-5">
          <p className="text-sm leading-relaxed text-gray-500 dark:text-slate-400">{faq.a}</p>
          {faq.image && (
            <img
              src={faq.image}
              alt={faq.q}
              className="w-full rounded-2xl border border-gray-100 object-cover dark:border-slate-800"
            />
          )}
        </div>
      )}
    </article>
  )
}

export function HelpPage() {
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()

  const filteredGuides = useMemo(() => {
    if (!normalizedQuery) return GUIDES
    return GUIDES.filter(guide => (
      guide.title.toLowerCase().includes(normalizedQuery) ||
      guide.summary.toLowerCase().includes(normalizedQuery) ||
      guide.steps.some(step => step.toLowerCase().includes(normalizedQuery))
    ))
  }, [normalizedQuery])

  const filteredFaqs = useMemo(() => {
    if (!normalizedQuery) return FAQS
    return FAQS.filter(faq => (
      faq.q.toLowerCase().includes(normalizedQuery) ||
      faq.a.toLowerCase().includes(normalizedQuery) ||
      faq.module.toLowerCase().includes(normalizedQuery)
    ))
  }, [normalizedQuery])

  const navItems = [
    { label: 'Abrir período', icon: CalendarRange, href: '#periodo' },
    { label: 'Dashboard', icon: LayoutDashboard, href: '#dashboard' },
    { label: 'Ingresos', icon: Wallet, href: '#ingresos' },
    { label: 'Egresos', icon: ShoppingCart, href: '#egresos' },
    { label: 'Catálogos', icon: Settings2, href: '#catalogos' },
    { label: 'Listas', icon: Repeat2, href: '#listas' },
    { label: 'Cierre', icon: FileText, href: '#cierre' },
    { label: 'Reportes', icon: Gauge, href: '#reportes' },
    { label: 'Perfil', icon: UserRound, href: '#perfil' },
  ]

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-0 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="space-y-5 p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
              <CircleHelp size={14} />
              Centro de ayuda
            </div>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-100 sm:text-4xl">
                Guías operativas ordenadas por flujo real de trabajo
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-gray-500 dark:text-slate-400">
                Esta versión reorganiza la ayuda para enseñar primero lo que necesitas habilitar, luego lo que debes registrar,
                y al final cómo cerrar, revisar y corregir. Las imágenes se mantienen como apoyo visual.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <Search size={16} className="shrink-0 text-gray-400" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar por módulo, acción o pregunta"
                  className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>
            </div>
          </div>

          <aside className="border-t border-gray-100 bg-gray-50 p-6 dark:border-slate-800 dark:bg-slate-950/40 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">
                  Ruta recomendada
                </p>
                <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-slate-400">
                  Sigue este orden para que la documentación respete el uso real del sistema.
                </p>
              </div>

              <nav className="grid gap-2">
                {navItems.map(item => {
                  const Icon = item.icon
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between rounded-2xl border border-transparent bg-white px-3 py-2.5 text-sm text-gray-700 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-primary-900/40 dark:hover:bg-primary-900/20"
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={15} className="text-primary-500" />
                        {item.label}
                      </span>
                      <ArrowRight size={14} className="text-gray-300" />
                    </a>
                  )
                })}
              </nav>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                Orden sugerido
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                Se priorizan dependencias antes de enseñar movimientos.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {GUIDES.map(guide => (
                <a
                  key={guide.id}
                  href={`#${guide.id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-soft transition-colors hover:border-primary-200 hover:bg-primary-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-primary-900/40 dark:hover:bg-primary-900/20"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                    <GuideBadge id={guide.id} />
                  </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{guide.title}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-slate-400">{guide.summary}</p>
                </div>
                <ArrowRight size={16} className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              Tópicos
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Cada bloque explica qué hacer, cómo hacerlo y qué orden seguir.
            </p>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            {GUIDES.map(guide => (
              <div key={guide.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{guide.title}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{guide.chips.join(' · ')}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-gray-500 dark:text-slate-400">{guide.summary}</p>
              </div>
            ))}
          </div>
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
          {filteredGuides.length > 0 ? (
            filteredGuides.map(guide => <GuideCard key={guide.id} guide={guide} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-soft dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              No hay resultados para la búsqueda actual.
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
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map(faq => <FaqItem key={faq.q} faq={faq} />)
            ) : (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                No hay preguntas que coincidan con tu búsqueda.
              </div>
            )}
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
