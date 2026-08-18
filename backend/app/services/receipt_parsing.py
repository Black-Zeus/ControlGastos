"""
Heurísticas best-effort para proponer monto y categoría a partir del texto
crudo de OCR de un recibo (ver app/workers/ocr_worker.py).

No hay IA ni parsing estructural real acá — son reglas simples sobre el texto.
Con boletas físicas mal fotografiadas (columnas de etiqueta/valor desalineadas
por el OCR) puede acertar la categoría o el monto equivocado; para eso existe
el paso de corrección manual (/modificar) antes de confirmar.
"""
import io
import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from PIL import Image
import pytesseract
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import Category
from app.models.merchant_memory import MerchantCategoryMemory


def run_ocr(content: bytes) -> str:
    """
    Bloqueante — llamar vía run_in_executor desde código async.

    --psm 6 (bloque uniforme de texto) en vez del modo automático por defecto:
    validado contra fotos reales de boletas físicas (arrugadas, en ángulo, con
    fondo) donde el modo automático de Tesseract pierde por completo las líneas
    de montos; --psm 6 las recupera sin necesidad de preprocesar la imagen.
    """
    image = Image.open(io.BytesIO(content))
    return pytesseract.image_to_string(image, lang="spa+eng", config="--psm 6").strip()

_AMOUNT_RE = re.compile(r"[\$§]\s*([\d][\d.,]*)")

# Orden de prioridad: la primera línea que matchee alguno de estos términos
# (en este orden) gana. "total" también matchea "subtotal" — se resuelve
# quedándose con el monto más alto entre los empates de prioridad.
_TOTAL_KEYWORDS = ["monto pagado", "total", "transferido", "monto", "pagado"]

# Heurística mínima palabra clave → nombre de categoría de sistema.
# Se busca substring case-insensitive en el texto OCR completo.
_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Alimentación":  ["supermercado", "mercado", "abarrotes", "minimarket"],
    "Transporte":    ["transporte publico", "transporte público", "bip!", "bip ", "uber", "taxi", "bencina", "combustible", "peaje"],
    "Restaurantes":  ["restaurant", "restaurante", "delivery", "pedidosya", "rappi"],
    "Medicamentos":  ["farmacia", "cruz verde", "salcobrand", "ahumada"],
    "Salud":         ["clinica", "clínica", "consulta medica", "consulta médica"],
}


def guess_amount(ocr_text: str) -> Optional[Decimal]:
    """Mejor esfuerzo: intenta identificar el monto TOTAL entre los $ del texto."""
    candidates: list[tuple[int, Decimal]] = []  # (prioridad, monto) — menor prioridad = mejor
    for line in ocr_text.split("\n"):
        match = _AMOUNT_RE.search(line)
        if not match:
            continue
        raw = match.group(1).replace(".", "").replace(",", "")
        if not raw.isdigit():
            continue
        amount = Decimal(raw)
        lower = line.lower()
        priority = next(
            (i for i, kw in enumerate(_TOTAL_KEYWORDS) if kw in lower),
            len(_TOTAL_KEYWORDS),
        )
        candidates.append((priority, amount))

    if not candidates:
        return None

    best_priority = min(c[0] for c in candidates)
    # Entre empates de prioridad (p.ej. "total" y "subtotal" matchean ambos),
    # se prefiere el monto más alto — suele ser el total real de la boleta.
    return max(amount for priority, amount in candidates if priority == best_priority)


def guess_category(
    ocr_text: str,
    categories: list[Category],
    memory: Optional[list[MerchantCategoryMemory]] = None,
) -> Optional[Category]:
    """
    Mejor esfuerzo. Primero consulta la memoria aprendida del usuario
    (ver remember_merchant_category) — si un comercio ya fue corregido antes,
    esa asociación gana sobre la lista fija de palabras clave. Si no hay
    memoria o no matchea nada, cae al diccionario genérico de siempre.
    """
    lower_text = ocr_text.lower()

    if memory:
        by_id = {c.id: c for c in categories}
        # Keyword más largo primero (más específico), luego el más reforzado.
        for m in sorted(memory, key=lambda m: (-len(m.merchant_keyword), -m.hit_count)):
            if m.merchant_keyword in lower_text:
                category = by_id.get(m.category_id)
                if category:
                    return category

    by_name = {c.name: c for c in categories}
    for category_name, keywords in _CATEGORY_KEYWORDS.items():
        category = by_name.get(category_name)
        if not category:
            continue
        if any(kw in lower_text for kw in keywords):
            return category

    return None


_MERCHANT_MIN_LEN = 4


def extract_merchant_keyword(ocr_text: str) -> Optional[str]:
    """
    Mejor esfuerzo: primera línea con contenido real (con letras, no solo
    ruido/números) — suele ser el nombre del comercio o app en capturas
    digitales limpias. En boletas físicas mal fotografiadas puede salir
    basura del OCR; no es grave, esa línea simplemente no volverá a matchear.
    """
    for line in ocr_text.split("\n"):
        normalized = " ".join(line.strip().lower().split())
        if len(normalized) < _MERCHANT_MIN_LEN:
            continue
        if not any(c.isalpha() for c in normalized):
            continue
        return normalized
    return None


async def remember_merchant_category(
    db: AsyncSession, user_id: uuid.UUID, ocr_text: str, category_id: uuid.UUID
) -> None:
    """
    Refuerza (o crea) la asociación comercio→categoría para este usuario, a
    partir de la categoría que finalmente confirmó. Llamar al confirmar un
    recibo de ingesta — no hace commit, el caller decide cuándo.
    """
    keyword = extract_merchant_keyword(ocr_text)
    if not keyword:
        return

    existing = (await db.execute(
        select(MerchantCategoryMemory).where(
            MerchantCategoryMemory.user_id == user_id,
            MerchantCategoryMemory.merchant_keyword == keyword,
        )
    )).scalar_one_or_none()

    if existing:
        existing.category_id = category_id
        existing.hit_count += 1
        existing.last_used_at = datetime.utcnow()
    else:
        db.add(MerchantCategoryMemory(
            user_id=user_id, merchant_keyword=keyword, category_id=category_id,
        ))
