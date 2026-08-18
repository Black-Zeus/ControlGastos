"""
Worker OCR — procesa imágenes de recibos en estado 'borrador'.
Se ejecuta como proceso independiente (Dockerfile.ocr).
Polling simple sobre la DB; en Fase 2 puede migrarse a Celery/Redis.
"""
import asyncio
import logging
from sqlalchemy import select
from app.database import AsyncSessionLocal
# Importa app.models (no los submódulos sueltos) para que el registro de
# mappers de SQLAlchemy quede completo — Expense.shopping_list_id referencia
# la tabla shopping_lists, que solo se registra si ese modelo fue importado.
from app.models import Expense, Attachment, ReviewStatus, TransactionSource, Category, MerchantCategoryMemory
from app.services.receipt_parsing import run_ocr, guess_amount, guess_category

log = logging.getLogger(__name__)


async def process_pending_receipts() -> None:
    from app import storage

    async with AsyncSessionLocal() as db:
        pending = (await db.execute(
            select(Expense).where(
                Expense.source == TransactionSource.ingestion,
                Expense.review_status == ReviewStatus.borrador,
            )
        )).scalars().all()

        loop = asyncio.get_event_loop()

        for expense in pending:
            attachments = (await db.execute(
                select(Attachment).where(
                    Attachment.expense_id == expense.id,
                    Attachment.ocr_raw_text.is_(None),
                )
            )).scalars().all()

            for attachment in attachments:
                try:
                    content, _ = await loop.run_in_executor(
                        None, storage.download_bytes, attachment.storage_key
                    )
                    text = await loop.run_in_executor(None, run_ocr, content)
                    # Texto vacío es un resultado válido (imagen sin texto legible);
                    # lo que importa es distinguir "no procesado" (None) de "procesado".
                    attachment.ocr_raw_text = text

                    # Propuesta best-effort — el usuario la corrige con /modificar
                    # antes de /aceptar si el monto o la categoría no calzan.
                    amount = guess_amount(text)
                    if amount is not None:
                        expense.amount = amount

                    categories = (await db.execute(
                        select(Category).where(
                            (Category.is_system.is_(True)) | (Category.user_id == expense.user_id)
                        )
                    )).scalars().all()
                    memory = (await db.execute(
                        select(MerchantCategoryMemory).where(
                            MerchantCategoryMemory.user_id == expense.user_id
                        )
                    )).scalars().all()
                    category = guess_category(text, categories, memory)
                    if category is not None:
                        expense.category_id = category.id

                    log.info(
                        "OCR completado para attachment %s (%d chars) — monto=%s categoria=%s",
                        attachment.id, len(text), amount, category.name if category else None,
                    )
                except Exception as exc:
                    log.warning("OCR fallido para %s: %s", attachment.id, exc)

        await db.commit()


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    log.info("OCR worker iniciado")
    while True:
        try:
            await process_pending_receipts()
        except Exception as exc:
            log.error("Error en ciclo OCR: %s", exc)
        await asyncio.sleep(30)


if __name__ == "__main__":
    asyncio.run(main())
