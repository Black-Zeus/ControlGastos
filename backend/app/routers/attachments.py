"""
Adjuntos de egresos — /api/v1/expenses/{expense_id}/attachments
"""
import asyncio
import os
import urllib.parse
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.transaction import Expense, Attachment

ALLOWED_MIME = {"image/jpeg", "image/png", "application/pdf"}
MAX_BYTES = 20 * 1024 * 1024  # 20 MB

# Magic bytes for each allowed MIME type
_MAGIC: dict[str, bytes] = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "application/pdf": b"%PDF",
}


def _safe_filename(filename: str | None) -> str:
    """Strip directory components and limit to base name."""
    if not filename:
        return "archivo"
    return os.path.basename(filename) or "archivo"


def _check_magic(content: bytes, mime: str) -> bool:
    magic = _MAGIC.get(mime)
    return magic is not None and content[:len(magic)] == magic


def _content_disposition(filename: str) -> str:
    """RFC 6266 encoded Content-Disposition attachment header."""
    encoded = urllib.parse.quote(filename, safe="")
    return f"attachment; filename*=UTF-8''{encoded}"

router = APIRouter(tags=["attachments"])


class AttachmentOut(BaseModel):
    id: uuid.UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


async def _get_expense_or_404(expense_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Expense:
    expense = (await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.user_id == user_id)
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Egreso no encontrado")
    return expense


@router.get("/expenses/{expense_id}/attachments", response_model=list[AttachmentOut])
async def list_attachments(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_expense_or_404(expense_id, current_user.id, db)
    rows = (await db.execute(
        select(Attachment)
        .where(Attachment.expense_id == expense_id)
        .order_by(Attachment.uploaded_at.asc())
    )).scalars().all()
    return rows


@router.post(
    "/expenses/{expense_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    expense_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_expense_or_404(expense_id, current_user.id, db)

    claimed_mime = file.content_type or ""
    if claimed_mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo no permitido. Usa: {', '.join(sorted(ALLOWED_MIME))}",
        )

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera el límite de 20 MB")

    # Validate actual file content against magic bytes
    if not _check_magic(content, claimed_mime):
        raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con el tipo declarado")

    safe_name = _safe_filename(file.filename)

    from app import storage
    loop = asyncio.get_event_loop()

    # Solo se permite 1 adjunto por egreso — eliminar el anterior si existe
    existing = (await db.execute(
        select(Attachment).where(Attachment.expense_id == expense_id)
    )).scalar_one_or_none()
    if existing:
        try:
            await loop.run_in_executor(None, storage.delete_object, existing.storage_key)
        except Exception:
            pass
        await db.delete(existing)
        await db.flush()

    storage_key = f"attachments/{current_user.id}/{expense_id}/{uuid.uuid4()}/{safe_name}"
    await loop.run_in_executor(None, storage.upload_bytes, content, storage_key, claimed_mime)

    att = Attachment(
        expense_id=expense_id,
        user_id=current_user.id,
        storage_key=storage_key,
        original_filename=safe_name,
        mime_type=claimed_mime,
        size_bytes=len(content),
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)
    return att


@router.get("/expenses/{expense_id}/attachments/{attachment_id}/content")
async def get_attachment_content(
    expense_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_expense_or_404(expense_id, current_user.id, db)

    att = (await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.expense_id == expense_id,
        )
    )).scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")

    from app import storage
    loop = asyncio.get_event_loop()
    data, content_type = await loop.run_in_executor(None, storage.download_bytes, att.storage_key)

    return StreamingResponse(
        iter([data]),
        media_type=content_type,
        headers={
            "Content-Disposition": _content_disposition(att.original_filename),
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete(
    "/expenses/{expense_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_attachment(
    expense_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_expense_or_404(expense_id, current_user.id, db)

    att = (await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.expense_id == expense_id,
        )
    )).scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")

    from app import storage
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, storage.delete_object, att.storage_key)
    except Exception:
        pass  # Si MinIO falla, igual borramos el registro

    await db.delete(att)
    await db.commit()
