"""
Seed data del sistema: categorías de egreso e tipos de ingreso predeterminados.
Estos registros tienen is_system=True y no pueden ser eliminados por los usuarios.
Los usuarios pueden activar/desactivar cada uno de forma independiente.
"""
from app.models.catalog import CategoryType


SYSTEM_CATEGORIES: list[dict] = [
    # Gastos básicos / no obviables
    {"name": "Agua",                  "type": CategoryType.recurrente, "default_obviable": False, "description": "Servicio de agua potable"},
    {"name": "Luz / Electricidad",    "type": CategoryType.recurrente, "default_obviable": False, "description": "Servicio eléctrico"},
    {"name": "Gas",                   "type": CategoryType.recurrente, "default_obviable": False, "description": "Gas de cañería o garrafa"},
    {"name": "Arriendo / Dividendo",  "type": CategoryType.recurrente, "default_obviable": False, "description": "Arriendo o dividendo hipotecario"},
    {"name": "Alimentación",          "type": CategoryType.recurrente, "default_obviable": False, "description": "Supermercado y compras de alimentos"},
    {"name": "Transporte",            "type": CategoryType.recurrente, "default_obviable": False, "description": "Locomoción, bencina, peajes"},
    {"name": "Salud",                 "type": CategoryType.recurrente, "default_obviable": False, "description": "Consultas médicas, dentista, exámenes"},
    {"name": "Medicamentos",          "type": CategoryType.puntual,    "default_obviable": False, "description": "Farmacia y remedios"},
    {"name": "Educación",             "type": CategoryType.recurrente, "default_obviable": False, "description": "Colegio, universidad, cursos"},
    {"name": "Pensión alimentos",     "type": CategoryType.recurrente, "default_obviable": False, "description": "Pensión alimenticia legal"},
    {"name": "Seguros",               "type": CategoryType.recurrente, "default_obviable": False, "description": "Seguro de vida, auto, hogar"},
    {"name": "Crédito / Cuota",       "type": CategoryType.recurrente, "default_obviable": False, "description": "Crédito de consumo, automotriz o similar"},
    {"name": "Limpieza y hogar",      "type": CategoryType.recurrente, "default_obviable": False, "description": "Productos de limpieza y artículos domésticos"},
    # Gastos obviables / discrecionales
    {"name": "Internet",              "type": CategoryType.recurrente, "default_obviable": True,  "description": "Servicio de internet"},
    {"name": "Telefonía móvil",       "type": CategoryType.recurrente, "default_obviable": True,  "description": "Plan de celular"},
    {"name": "Streaming",             "type": CategoryType.recurrente, "default_obviable": True,  "description": "Netflix, Spotify, Disney+ y similares"},
    {"name": "Herramientas IA",       "type": CategoryType.recurrente, "default_obviable": True,  "description": "ChatGPT, Claude, Copilot, Codex y suscripciones de IA"},
    {"name": "Restaurantes",          "type": CategoryType.puntual,    "default_obviable": True,  "description": "Comida fuera del hogar, delivery"},
    {"name": "Vestuario",             "type": CategoryType.puntual,    "default_obviable": True,  "description": "Ropa y accesorios"},
    {"name": "Calzado",               "type": CategoryType.puntual,    "default_obviable": True,  "description": "Zapatos y zapatillas"},
    {"name": "Mascotas",              "type": CategoryType.recurrente, "default_obviable": True,  "description": "Alimento, veterinaria y accesorios de mascotas"},
    {"name": "Recreación",            "type": CategoryType.puntual,    "default_obviable": True,  "description": "Salidas, cine, deporte, actividades de ocio"},
    {"name": "Cuidado personal",      "type": CategoryType.recurrente, "default_obviable": True,  "description": "Peluquería, spa, productos de higiene personal"},
    {"name": "Regalos",               "type": CategoryType.puntual,    "default_obviable": True,  "description": "Regalos y celebraciones"},
    {"name": "Mantención / Reparaciones", "type": CategoryType.puntual, "default_obviable": False, "description": "Arreglos del hogar, auto u objetos"},
    {"name": "Gastos comunes",   "type": CategoryType.recurrente, "default_obviable": False, "description": "Gastos comunes o aportes comunales"},
    {"name": "Gastos Menores",        "type": CategoryType.puntual,    "default_obviable": True,  "description": "Gastos cotidianos de bajo monto sin categoría específica"},
    {"name": "Gastos Personales",     "type": CategoryType.puntual,    "default_obviable": True,  "description": "Gastos de uso y consumo personal propios del usuario"},
    {"name": "Ahorro",                "type": CategoryType.recurrente, "default_obviable": False, "description": "Transferencias o depósitos a cuentas de ahorro o inversión"},
    {"name": "Otros",                 "type": CategoryType.puntual,    "default_obviable": True,  "description": "Gastos que no calzan en otra categoría"},
]


SYSTEM_INCOME_TYPES: list[dict] = [
    {"name": "Sueldo"},
    {"name": "Honorarios"},
    {"name": "Venta"},
    {"name": "Devolución"},
    {"name": "Bono"},
    {"name": "Aporte familiar"},
    {"name": "Otro"},
]
