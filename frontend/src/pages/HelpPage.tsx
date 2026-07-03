import { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'
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

interface Guide {
  title: string
  image: string
  steps: string[]
}

const GUIDES: Guide[] = [
  {
    title: '1. Crear un período',
    image: imgAbrirPeriodo,
    steps: [
      'Ve a "Períodos" en el menú y pulsa "Abrir período".',
      'Es el punto de partida obligatorio: no puedes registrar ingresos ni egresos sin un período abierto.',
      'Solo puede haber un período abierto a la vez, y se abren en orden — el sistema te propone el siguiente mes disponible.',
      'Si ya cerraste un período antes, los egresos recurrentes y los que quedaron pendientes se trasladan automáticamente al nuevo período.',
    ],
  },
  {
    title: '2. Conocer la interfaz (Dashboard)',
    image: imgDashboard,
    steps: [
      'El Dashboard es tu pantalla de inicio: resume el período abierto en tarjetas (ingresos, egresos saldados/pendientes, dinero libre).',
      'Más abajo verás el flujo diario del mes, egresos por categoría y el detalle por responsable.',
      'El menú lateral izquierdo es tu punto de navegación a todo: Ingresos, Egresos, Reportes, Períodos, Catálogos y este Centro de ayuda.',
      'Haz clic en el logo o el nombre "ControlGastos" arriba del menú para ver la versión y un resumen de funcionalidades.',
    ],
  },
  {
    title: '3. Registrar un ingreso',
    image: imgIngresos,
    steps: [
      'Con un período abierto, entra a "Ingresos" en el menú lateral.',
      'Pulsa "+ Nuevo ingreso".',
      'Completa fecha, descripción, tipo de ingreso, monto y responsable.',
      'Marca el estado de pago — pendiente o recibido — puedes cambiarlo después.',
    ],
  },
  {
    title: '4. Registrar un egreso',
    image: imgEgresos,
    steps: [
      'Entra a "Egresos" en el menú lateral.',
      'Pulsa "+ Nuevo egreso".',
      'Completa fecha, descripción, categoría, monto y responsable.',
      'Marca el estado de pago — pendiente o saldado — y si es recurrente o puntual.',
      'Si un egreso o ingreso queda "pendiente" y su fecha es mañana, te llega un correo recordatorio agrupado con todos tus compromisos del día siguiente (activable en Mi perfil → Notificaciones).',
    ],
  },
  {
    title: '5. Crear categorías y tipos de ingreso personalizados',
    image: imgCatalogos,
    steps: [
      'Ve a "Catálogos" en el menú.',
      'Además de las categorías del sistema, puedes crear las tuyas propias para egresos e ingresos.',
      'Cada categoría puede marcarse como "obviable por defecto", útil para gastos fijos que no quieres que afecten ciertos totales.',
    ],
  },
  {
    title: '6. Cerrar un período',
    image: imgPeriodos,
    steps: [
      'Cuando el mes esté completo, ve a "Períodos" y pulsa "Cerrar período".',
      'Se calcula el balance final y se genera automáticamente el reporte en PDF.',
      'Te llega un correo con el resumen (ingresos, egresos, balance) y el PDF adjunto — el mismo que puedes ver o descargar después desde "Períodos" con el botón "Ver reporte".',
      'Una vez cerrado, ya puedes abrir el período siguiente.',
    ],
  },
  {
    title: '7. Reabrir un período',
    image: imgReabrirPeriodo,
    steps: [
      'Solo se puede reabrir el período cerrado más reciente (no uno más antiguo), y solo si no tienes otro período abierto en este momento.',
      'En "Períodos", expande el período cerrado y pulsa "Reabrir".',
      'El reporte PDF de ese período se elimina y los totales se recalculan — te llega un correo avisando que fue reabierto.',
      'Haz tus ajustes y vuelve a cerrarlo cuando termines.',
    ],
  },
  {
    title: 'Revisar tus reportes',
    image: imgReportes,
    steps: [
      'En "Reportes" encuentras tres vistas: Comparación, Tendencia y Por categoría.',
      '"Comparación" contrasta dos períodos lado a lado.',
      '"Tendencia" muestra la evolución mes a mes.',
      '"Por categoría" desglosa en qué se va la plata.',
    ],
  },
  {
    title: 'Recuperar tu contraseña olvidada',
    image: imgForgotPassword,
    steps: [
      'En la pantalla de inicio de sesión, pulsa "¿Olvidaste tu contraseña?".',
      'Ingresa tu correo — te llegará un código de verificación de 6 dígitos.',
      'Ingresa el código recibido para confirmar tu identidad.',
      'Define tu nueva contraseña (con la barra de fortaleza como guía) y ya puedes iniciar sesión con ella.',
    ],
  },
  {
    title: 'Configurar tu perfil, seguridad y notificaciones',
    image: imgPerfil,
    steps: [
      'Entra a "Mi perfil" desde el menú de usuario, abajo a la izquierda.',
      'En "Información personal" ajustas tu moneda y zona horaria.',
      'En "Seguridad" puedes cambiar tu contraseña — una barra de fortaleza te indica qué tan segura es mientras escribes.',
      'En "Notificaciones" activas o desactivas los recordatorios diarios de compromisos pendientes y eliges la hora de envío.',
    ],
  },
]

interface Faq {
  q: string
  a: string
  image?: string
}

const FAQS: Faq[] = [
  {
    q: '¿Cómo cambio mi contraseña?',
    a: 'Qué es: el formulario de seguridad de tu cuenta, dentro de tu perfil. Para qué sirve: actualizar la clave con la que inicias sesión, algo que conviene hacer periódicamente o si sospechas que alguien más la conoce. Cómo se hace: ve a Mi perfil → Seguridad, ingresa tu contraseña actual y la nueva dos veces — una barra de fortaleza te muestra qué tan segura es a medida que escribes, y el botón de ojo te deja verla mientras la tipeas.',
  },
  {
    q: '¿Qué pasa si reabro un período ya cerrado?',
    a: 'Qué es: una acción de reversión sobre el cierre mensual. Para qué sirve: corregir un egreso o ingreso que olvidaste registrar antes de cerrar, sin tener que esperar al mes siguiente. Cómo se hace: en "Períodos", expande el período cerrado más reciente (solo ese puede reabrirse, y solo si no tienes otro período abierto) y pulsa "Reabrir". El reporte PDF de ese período se elimina, los totales se recalculan y te llega un correo avisando que fue reabierto. Haz tus ajustes y vuelve a cerrarlo cuando termines.',
    image: imgReabrirPeriodo,
  },
  {
    q: '¿Recibo algún correo cuando cierro un período?',
    a: 'Qué es: una notificación automática por email. Para qué sirve: tener un respaldo del cierre mensual sin tener que entrar a la app, y poder compartir o archivar el resumen. Cómo se activa: no requiere configuración — ocurre automáticamente cada vez que pulsas "Cerrar período" en "Períodos". El correo trae el resumen (ingresos, egresos y balance) y el reporte en PDF adjunto, el mismo que puedes volver a ver o descargar después con el botón "Ver reporte".',
    image: imgReportePdfPreview,
  },
  {
    q: '¿Cómo recupero mi contraseña si la olvidé?',
    a: 'Qué es: el flujo de recuperación de acceso cuando no puedes iniciar sesión. Para qué sirve: recobrar el acceso a tu cuenta sin depender de un administrador. Cómo se hace: en la pantalla de inicio de sesión, pulsa "¿Olvidaste tu contraseña?", ingresa tu correo y te llegará un código de 6 dígitos. Con ese código confirmas tu identidad y defines una nueva contraseña.',
    image: imgForgotPassword,
  },
  {
    q: '¿Me avisan si mi contraseña cambia?',
    a: 'Qué es: una alerta de seguridad por email. Para qué sirve: que te enteres de inmediato si tu contraseña cambió sin que lo hicieras tú — la primera señal de una cuenta comprometida. Cómo se activa: no requiere configuración, se envía automáticamente cada vez que la contraseña se actualiza, ya sea por ti o, en el caso de un administrador, por otra persona. Si no reconoces el cambio, contacta al administrador de inmediato.',
  },
  {
    q: '¿Cómo activo los recordatorios diarios por correo?',
    a: 'Qué es: un resumen diario de compromisos financieros por email. Para qué sirve: que no se te pase pagar (o cobrar) algo que anotaste como pendiente. Cómo se activa: en Mi perfil → Notificaciones, activa el interruptor y elige la hora de envío. Recibirás un correo el día anterior a cada egreso o ingreso marcado como "pendiente", con todos los compromisos del día siguiente agrupados.',
    image: imgPerfilNotificaciones,
  },
  {
    q: '¿Qué significa marcar un egreso como "obviable"?',
    a: 'Qué es: una marca opcional al registrar un egreso. Para qué sirve: identificar gastos que no quieres que se cuenten en ciertos totales o resúmenes — por ejemplo, un gasto recurrente que ya llevas contabilizado por otro lado y no quieres que "infle" tus cifras del mes. Cómo se activa: al crear o editar un egreso, marca la casilla "Obviable"; puedes cambiarla en cualquier momento.',
  },
  {
    q: '¿Qué diferencia hay entre "pendiente" y "saldado" / "recibido"?',
    a: 'Qué es: el estado de pago de cada registro. Para qué sirve: distinguir lo que ya se pagó/cobró de lo que todavía está en el aire, para que el balance del período y los recordatorios diarios reflejen tu situación real. Cómo se usa: un egreso "pendiente" aún no se ha pagado, uno "saldado" sí; para ingresos el equivalente es "pendiente" y "recibido". Puedes cambiar el estado en cualquier momento desde la lista de Egresos o Ingresos.',
  },
  {
    q: '¿Puedo asignar un responsable a cada egreso o ingreso?',
    a: 'Qué es: una etiqueta de texto libre en cada registro. Para qué sirve: separar gastos e ingresos compartidos entre varias personas del hogar y ver el detalle "Por responsable" en el Dashboard. Cómo se hace: al crear o editar un egreso o ingreso, completa el campo "Responsable" (es opcional).',
  },
  {
    q: '¿Dónde veo la versión de la aplicación y qué cubre?',
    a: 'Qué es: un modal informativo "Acerca de ControlGastos". Para qué sirve: consultar rápidamente la versión instalada y un resumen de las funcionalidades del sistema. Cómo se activa: haz clic en el logo o el nombre "ControlGastos" en la parte superior del menú lateral, en la vista de usuario o en la de administración.',
    image: imgAboutModal,
  },
]

function GuideCard({ guide }: { guide: Guide }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-soft">
      <img src={guide.image} alt={guide.title} className="w-full border-b border-gray-100 dark:border-slate-800" />
      <div className="p-6">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-slate-100">{guide.title}</h3>
        <ol className="space-y-2">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-gray-600 dark:text-slate-400">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/30 text-[11px] font-semibold text-primary-700 dark:text-primary-400">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function FaqItem({ q, a, image }: Faq) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 dark:border-slate-800 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">{q}</span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-gray-400 transition-transform dark:text-slate-500', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-4 pb-4 pr-8">
          <p className="text-sm leading-relaxed text-gray-500 dark:text-slate-400">{a}</p>
          {image && (
            <img
              src={image}
              alt={q}
              className="mx-auto w-full max-w-xl rounded-xl border border-gray-100 dark:border-slate-800"
            />
          )}
        </div>
      )}
    </div>
  )
}

export function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-slate-100">
          <HelpCircle size={20} className="text-primary-500" />
          Centro de ayuda
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Guías paso a paso y respuestas a las preguntas más comunes sobre ControlGastos.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
          Guías paso a paso
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {GUIDES.map(guide => (
            <GuideCard key={guide.title} guide={guide} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
          Preguntas frecuentes
        </h2>
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft px-6">
          {FAQS.map(faq => (
            <FaqItem key={faq.q} {...faq} />
          ))}
        </div>
      </div>
    </div>
  )
}
