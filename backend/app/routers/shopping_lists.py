"""
Listas de compra reutilizables — /api/v1/shopping-lists

Una lista de compra es una plantilla que el usuario reutiliza (supermercado, feria,
cumpleaños, etc.). Se le van agregando productos y marcando cuáles se compraron y a
qué precio. En algún momento se "envía a egreso": se crea un Expense en el período
abierto con el monto = suma de los ítems comprados, y un snapshot de esos ítems queda
guardado en Expense.items — pero la lista en sí NO se modifica ni se cierra, sigue
disponible para la próxima compra. Reiniciarla (desmarcar todo) es una acción aparte.
"""
import asyncio
import logging
import re
import uuid
from datetime import datetime
from datetime import date as date_cls
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.shopping_list import ShoppingList, ShoppingListItem
from app.models.transaction import Attachment, Expense, PaymentStatus, ReviewStatus, TransactionSource
from app.models.catalog import Category
from app.models.period import Period, PeriodStatus
from app.routers.expenses import _build_out as _build_expense_out, _assert_expense_editable, ExpenseOut
from app.services.pdf_report import generate_pdf
from app.services.period_rules import assert_date_in_period
from app.services.pdf_shopping_list import EvidenceRow, build_shopping_list_evidence_html

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/shopping-lists", tags=["shopping-lists"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ShoppingListItemOut(BaseModel):
    id: uuid.UUID
    label: str
    quantity: Decimal
    purchased: bool
    unit_price: Optional[Decimal]
    observation: Optional[str]
    obviable: bool
    sent_at: Optional[datetime]
    position: int

    model_config = {"from_attributes": True}


class ShoppingListOut(BaseModel):
    id: uuid.UUID
    name: str
    default_category_id: Optional[uuid.UUID]
    archived: bool
    planned_date: Optional[date_cls] = None
    created_at: datetime
    updated_at: datetime
    last_sent_at: Optional[datetime] = None
    items: list[ShoppingListItemOut] = []
    item_count: int = 0
    purchased_count: int = 0
    pending_send_count: int = 0
    # Monto e ítems comprados aún no enviados a egreso en el período abierto: es el
    # "borrador" que la lista muestra en Egresos.
    pending_send_amount: Decimal = Decimal("0")
    pending_send_item_ids: list[uuid.UUID] = []

    model_config = {"from_attributes": True}


class ShoppingListCreate(BaseModel):
    name: str
    default_category_id: Optional[uuid.UUID] = None
    planned_date: Optional[date_cls] = None


class ShoppingListUpdate(BaseModel):
    name: Optional[str] = None
    default_category_id: Optional[uuid.UUID] = None
    archived: Optional[bool] = None
    # Admite null explícito para quitar la fecha (ver update_shopping_list).
    planned_date: Optional[date_cls] = None


class ShoppingListItemCreate(BaseModel):
    label: str
    quantity: Decimal = Decimal("1")
    unit_price: Optional[Decimal] = None
    observation: Optional[str] = None
    obviable: bool = False


class ShoppingListItemUpdate(BaseModel):
    label: Optional[str] = None
    quantity: Optional[Decimal] = None
    purchased: Optional[bool] = None
    unit_price: Optional[Decimal] = None
    observation: Optional[str] = None
    obviable: Optional[bool] = None
    position: Optional[int] = None


class CloneRequest(BaseModel):
    name: Optional[str] = None


class SendToExpenseRequest(BaseModel):
    date: date_cls
    label: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    observation: Optional[str] = None
    responsible_tag: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_open_period(db: AsyncSession, user_id: uuid.UUID) -> Period:
    period = (await db.execute(
        select(Period).where(
            Period.user_id == user_id,
            Period.status == PeriodStatus.abierto,
        )
    )).scalar_one_or_none()
    if not period:
        raise HTTPException(
            status_code=409,
            detail="No hay período abierto. Abre un período antes de registrar egresos.",
        )
    return period


async def _get_list_or_404(list_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> ShoppingList:
    shopping_list = (await db.execute(
        select(ShoppingList)
        .where(ShoppingList.id == list_id, ShoppingList.user_id == user_id)
    )).scalar_one_or_none()
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista de compra no encontrada")
    return shopping_list


async def _get_item_or_404(
    list_id: uuid.UUID, item_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> ShoppingListItem:
    await _get_list_or_404(list_id, user_id, db)
    item = (await db.execute(
        select(ShoppingListItem).where(
            ShoppingListItem.id == item_id,
            ShoppingListItem.shopping_list_id == list_id,
        )
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return item


def _build_item_snapshot(item: ShoppingListItem) -> dict:
    # quantity/unit_price/obviable congelados al enviar: la evidencia PDF no debe depender
    # del estado posterior de la lista (que puede reiniciarse o editarse).
    return {
        "id": str(item.id),
        "label": item.label,
        "amount": str(item.quantity * item.unit_price),
        "quantity": str(item.quantity),
        "unit_price": str(item.unit_price),
        "obviable": bool(item.obviable),
    }


def _build_list_out(shopping_list: ShoppingList, items: list[ShoppingListItem]) -> dict:
    sent_dates = [i.sent_at for i in items if i.sent_at is not None]
    # Pendiente de enviar = comprado y aún no incluido en un envío (sent_at se limpia al reiniciar).
    pending = [i for i in items if i.purchased and i.sent_at is None]
    return {
        "id":                  shopping_list.id,
        "name":                shopping_list.name,
        "default_category_id": shopping_list.default_category_id,
        "archived":            shopping_list.archived,
        "planned_date":        shopping_list.planned_date,
        "created_at":          shopping_list.created_at,
        "updated_at":          shopping_list.updated_at,
        "last_sent_at":        max(sent_dates) if sent_dates else None,
        "items":               items,
        "item_count":          len(items),
        "purchased_count":     sum(1 for i in items if i.purchased),
        "pending_send_count":  len(pending),
        "pending_send_amount": sum((i.quantity * (i.unit_price or 0) for i in pending), Decimal("0")),
        "pending_send_item_ids": [i.id for i in pending],
    }


async def _load_items(db: AsyncSession, list_id: uuid.UUID) -> list[ShoppingListItem]:
    return list((await db.execute(
        select(ShoppingListItem)
        .where(ShoppingListItem.shopping_list_id == list_id)
        .order_by(ShoppingListItem.position.asc())
    )).scalars().all())


# ─── Endpoints — listas ──────────────────────────────────────────────────────

@router.get("", response_model=list[ShoppingListOut])
async def list_shopping_lists(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    archived: Optional[bool] = Query(None),
):
    stmt = select(ShoppingList).where(ShoppingList.user_id == current_user.id)
    if archived is None:
        stmt = stmt.where(ShoppingList.archived.is_(False))
    else:
        stmt = stmt.where(ShoppingList.archived.is_(archived))
    stmt = stmt.order_by(ShoppingList.updated_at.desc())

    lists = (await db.execute(stmt)).scalars().all()
    if not lists:
        return []

    list_ids = [l.id for l in lists]
    rows = (await db.execute(
        select(ShoppingListItem).where(ShoppingListItem.shopping_list_id.in_(list_ids))
    )).scalars().all()
    items_by_list: dict[uuid.UUID, list[ShoppingListItem]] = {}
    for item in rows:
        items_by_list.setdefault(item.shopping_list_id, []).append(item)

    return [
        _build_list_out(l, items_by_list.get(l.id, []))
        for l in lists
    ]


@router.post("", response_model=ShoppingListOut, status_code=status.HTTP_201_CREATED)
async def create_shopping_list(
    body: ShoppingListCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.planned_date is not None:
        assert_date_in_period(body.planned_date, await _get_open_period(db, current_user.id))
    shopping_list = ShoppingList(user_id=current_user.id, **body.model_dump())
    db.add(shopping_list)
    await db.commit()
    await db.refresh(shopping_list)
    return _build_list_out(shopping_list, [])


@router.get("/{list_id}", response_model=ShoppingListOut)
async def get_shopping_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shopping_list = await _get_list_or_404(list_id, current_user.id, db)
    items = await _load_items(db, list_id)
    return _build_list_out(shopping_list, items)


@router.patch("/{list_id}", response_model=ShoppingListOut)
async def update_shopping_list(
    list_id: uuid.UUID,
    body: ShoppingListUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shopping_list = await _get_list_or_404(list_id, current_user.id, db)
    if body.name is not None:
        body.name = body.name.strip()
        if not body.name:
            raise HTTPException(status_code=400, detail="El nombre de la lista no puede estar vacío")
    for field, value in body.model_dump(exclude_none=True, exclude={"planned_date"}).items():
        setattr(shopping_list, field, value)
    if "planned_date" in body.model_fields_set:
        if body.planned_date is not None:
            assert_date_in_period(body.planned_date, await _get_open_period(db, current_user.id))
        shopping_list.planned_date = body.planned_date
    await db.commit()
    await db.refresh(shopping_list)
    items = await _load_items(db, list_id)
    return _build_list_out(shopping_list, items)


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shopping_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina la lista (cascade a sus ítems). Los egresos que ya generó conservan su
    snapshot en Expense.items y quedan con shopping_list_id en null (ON DELETE SET NULL)."""
    shopping_list = await _get_list_or_404(list_id, current_user.id, db)
    await db.delete(shopping_list)
    await db.commit()


@router.post("/{list_id}/clone", response_model=ShoppingListOut, status_code=status.HTTP_201_CREATED)
async def clone_shopping_list(
    list_id: uuid.UUID,
    body: CloneRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    original = await _get_list_or_404(list_id, current_user.id, db)
    original_items = await _load_items(db, list_id)

    clone = ShoppingList(
        user_id=current_user.id,
        name=body.name or f"{original.name} (copia)",
        default_category_id=original.default_category_id,
    )
    db.add(clone)
    await db.flush()

    for item in original_items:
        db.add(ShoppingListItem(
            shopping_list_id=clone.id,
            label=item.label,
            quantity=item.quantity,
            purchased=False,
            unit_price=None,
            observation=item.observation,
            obviable=item.obviable,
            position=item.position,
        ))

    await db.commit()
    await db.refresh(clone)
    items = await _load_items(db, clone.id)
    return _build_list_out(clone, items)


@router.post("/{list_id}/reset", response_model=ShoppingListOut)
async def reset_shopping_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Desmarca todos los ítems (purchased=false, unit_price=null, sent_at=null) para
    reutilizar la lista en la próxima compra. No se llama automáticamente al enviar a egreso."""
    shopping_list = await _get_list_or_404(list_id, current_user.id, db)
    items = await _load_items(db, list_id)
    for item in items:
        item.purchased = False
        item.unit_price = None
        item.sent_at = None
    await db.commit()
    items = await _load_items(db, list_id)
    return _build_list_out(shopping_list, items)


# ─── Endpoints — ítems ────────────────────────────────────────────────────────

@router.post(
    "/{list_id}/items", response_model=ShoppingListItemOut, status_code=status.HTTP_201_CREATED
)
async def create_item(
    list_id: uuid.UUID,
    body: ShoppingListItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_list_or_404(list_id, current_user.id, db)
    max_position = (await db.execute(
        select(func.max(ShoppingListItem.position)).where(ShoppingListItem.shopping_list_id == list_id)
    )).scalar()
    item = ShoppingListItem(
        shopping_list_id=list_id,
        position=(max_position + 1) if max_position is not None else 0,
        **body.model_dump(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{list_id}/items/{item_id}", response_model=ShoppingListItemOut)
async def update_item(
    list_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ShoppingListItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = await _get_item_or_404(list_id, item_id, current_user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    list_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = await _get_item_or_404(list_id, item_id, current_user.id, db)
    await db.delete(item)
    await db.commit()


# ─── Envío a egreso ───────────────────────────────────────────────────────────

@router.post("/{list_id}/send-to-expense", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def send_to_expense(
    list_id: uuid.UUID,
    body: SendToExpenseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea SIEMPRE un egreso nuevo (con su PDF de evidencia) con los ítems comprados que
    aún no se enviaron (sent_at is null): una misma lista puede generar varios egresos en
    el mes (p. ej. la feria de cada semana) y nunca modifica uno ya registrado. Los ítems
    enviados quedan con sent_at; reiniciar la lista (POST /{list_id}/reset) lo limpia."""
    open_period = await _get_open_period(db, current_user.id)
    assert_date_in_period(body.date, open_period)
    shopping_list = await _get_list_or_404(list_id, current_user.id, db)
    items = await _load_items(db, list_id)

    purchased_items = [i for i in items if i.purchased and i.sent_at is None]
    if not purchased_items:
        raise HTTPException(
            status_code=400,
            detail="No hay productos marcados como comprados pendientes de enviar. "
                   "Si ya enviaste esta lista, reiníciala para la próxima compra.",
        )
    if any(i.unit_price is None for i in purchased_items):
        raise HTTPException(
            status_code=400,
            detail="Completa el valor unitario de todos los productos marcados como comprados",
        )

    category_id = body.category_id or shopping_list.default_category_id
    if category_id is None:
        raise HTTPException(
            status_code=400,
            detail="Esta lista no tiene categoría por defecto — indica una categoría",
        )
    cat = (await db.execute(
        select(Category).where(
            Category.id == category_id,
            (Category.is_system.is_(True)) | (Category.user_id == current_user.id),
        )
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=400, detail="Categoría no válida")

    amount = sum((i.quantity * i.unit_price for i in purchased_items), Decimal("0"))
    snapshot = [_build_item_snapshot(i) for i in purchased_items]
    expense = Expense(
        user_id=current_user.id,
        period_id=open_period.id,
        date=body.date,
        label=body.label or shopping_list.name,
        category_id=category_id,
        amount=amount,
        source=TransactionSource.web,
        review_status=ReviewStatus.confirmado,
        payment_status=PaymentStatus.saldado,
        shopping_list_id=shopping_list.id,
        items=snapshot,
        items_from_list=True,
        observation=body.observation,
        responsible_tag=body.responsible_tag,
    )
    db.add(expense)
    sent_at = datetime.utcnow()
    for item in purchased_items:
        item.sent_at = sent_at
    await db.commit()
    await db.refresh(expense)

    # Evidencia en PDF (best-effort: si Gotenberg o MinIO fallan, el egreso ya quedó registrado).
    att_count = await _attach_list_evidence(db, expense, shopping_list, cat, current_user, sent_at)
    return _build_expense_out(expense, cat, att_count)


async def _attach_list_evidence(
    db: AsyncSession,
    expense: Expense,
    shopping_list: ShoppingList,
    cat: Category,
    user: User,
    sent_at: datetime,
) -> int:
    """Genera el PDF de la lista y lo deja como adjunto único del egreso (si ya tuviera
    uno, lo reemplaza). Devuelve cuántos adjuntos quedan en el egreso."""
    from app import storage

    # Solo datos del snapshot del egreso; los envíos anteriores a esta versión no guardaban
    # cantidad/precio y se muestran con "—".
    rows: list[EvidenceRow] = []
    for snap in expense.items or []:
        if not isinstance(snap, dict):
            continue
        rows.append(EvidenceRow(
            label=snap.get("label", ""),
            subtotal=Decimal(str(snap.get("amount", "0"))),
            quantity=Decimal(snap["quantity"]) if snap.get("quantity") is not None else None,
            unit_price=Decimal(snap["unit_price"]) if snap.get("unit_price") is not None else None,
            obviable=bool(snap.get("obviable", False)),
        ))

    existing = (await db.execute(
        select(Attachment).where(Attachment.expense_id == expense.id)
    )).scalar_one_or_none()
    loop = asyncio.get_event_loop()
    try:
        html = build_shopping_list_evidence_html(
            list_name=shopping_list.name,
            expense_label=expense.label,
            user_name=user.name,
            currency=user.currency,
            user_timezone=user.timezone or 'America/Santiago',
            list_created_at=shopping_list.created_at,
            sent_at=sent_at,
            expense_date=expense.date,
            planned_date=shopping_list.planned_date,
            category_name=cat.name,
            responsible=expense.responsible_tag,
            observation=expense.observation,
            rows=rows,
        )
        pdf = await generate_pdf(html, full_bleed=True)

        slug = re.sub(r"[^\w-]+", "-", shopping_list.name.lower()).strip("-")[:60] or "lista"
        filename = f"lista-{slug}-{sent_at:%Y%m%d}.pdf"
        storage_key = f"attachments/{user.id}/{expense.id}/{uuid.uuid4()}/{filename}"
        await loop.run_in_executor(None, storage.upload_bytes, pdf, storage_key, "application/pdf")

        # Un solo adjunto por egreso: el PDF reemplaza al anterior.
        if existing:
            try:
                await loop.run_in_executor(None, storage.delete_object, existing.storage_key)
            except Exception:
                logger.warning("No se pudo borrar el adjunto previo %s", existing.storage_key)
            await db.delete(existing)
        db.add(Attachment(
            expense_id=expense.id,
            user_id=user.id,
            storage_key=storage_key,
            original_filename=filename,
            mime_type="application/pdf",
            size_bytes=len(pdf),
        ))
        await db.commit()
        return 1
    except Exception:
        logger.exception("No se pudo generar el PDF de evidencia de la lista %s", shopping_list.id)
        await db.rollback()
        return 1 if existing else 0


# ─── Devolver un egreso a lista de compra ─────────────────────────────────────

@router.post("/from-expense/{expense_id}", response_model=ShoppingListOut, status_code=status.HTTP_201_CREATED)
async def expense_to_shopping_list(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convierte un egreso con desglose en una lista de compra nueva y elimina el egreso
    (con su adjunto). Es la vía para corregir un desglose bloqueado: se edita la lista y
    se vuelve a enviar, lo que genera un egreso nuevo con su PDF. Los ítems quedan
    comprados con su cantidad y precio; los de desglose manual, con cantidad 1."""
    from app import storage

    expense = (await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.user_id == current_user.id)
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Egreso no encontrado")
    await _assert_expense_editable(expense, db)
    snapshot = [i for i in (expense.items or []) if isinstance(i, dict)]
    if not snapshot:
        raise HTTPException(status_code=400, detail="El egreso no tiene desglose para convertir en lista")

    shopping_list = ShoppingList(
        user_id=current_user.id,
        name=expense.label[:150],
        default_category_id=expense.category_id,
        planned_date=expense.date,
    )
    db.add(shopping_list)
    await db.flush()
    for pos, snap in enumerate(snapshot):
        amount = Decimal(str(snap.get("amount", "0")))
        quantity = Decimal(str(snap["quantity"])) if snap.get("quantity") is not None else Decimal("1")
        unit_price = Decimal(str(snap["unit_price"])) if snap.get("unit_price") is not None else amount
        db.add(ShoppingListItem(
            shopping_list_id=shopping_list.id,
            label=str(snap.get("label", ""))[:255] or "Producto",
            quantity=quantity,
            unit_price=unit_price,
            purchased=True,
            obviable=bool(snap.get("obviable", False)),
            position=pos,
        ))

    attachments = (await db.execute(
        select(Attachment).where(Attachment.expense_id == expense.id)
    )).scalars().all()
    storage_keys = [a.storage_key for a in attachments]
    await db.delete(expense)
    await db.commit()

    # Borrado de archivos best-effort: la base ya quedó consistente.
    loop = asyncio.get_event_loop()
    for key in storage_keys:
        try:
            await loop.run_in_executor(None, storage.delete_object, key)
        except Exception:
            logger.warning("No se pudo borrar el adjunto %s del egreso devuelto a lista", key)

    await db.refresh(shopping_list)
    return _build_list_out(shopping_list, await _load_items(db, shopping_list.id))
