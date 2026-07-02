"""
Worker OCR — procesa imágenes de recibos en estado 'borrador'.
Se ejecuta como proceso independiente (Dockerfile.ocr).
Polling simple sobre la DB; en Fase 2 puede migrarse a Celery/Redis.
"""
import asyncio
import logging
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.transaction import Expense, Attachment, ReviewStatus, TransactionSource

log = logging.getLogger(__name__)


async def process_pending_receipts() -> None:
    async with AsyncSessionLocal() as db:
        pending = (await db.execute(
            select(Expense).where(
                Expense.source == TransactionSource.ingestion,
                Expense.review_status == ReviewStatus.borrador,
            )
        )).scalars().all()

        for expense in pending:
            attachments = (await db.execute(
                select(Attachment).where(
                    Attachment.expense_id == expense.id,
                    Attachment.ocr_raw_text.is_(None),
                )
            )).scalars().all()

            for attachment in attachments:
                try:
                    # TODO: descargar desde MinIO, correr pytesseract, actualizar ocr_raw_text
                    # TODO: intentar extraer monto y fecha del texto crudo
                    log.info("OCR pendiente para attachment %s", attachment.id)
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
