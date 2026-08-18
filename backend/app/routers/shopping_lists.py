"""
Listas de compra reutilizables — /api/v1/shopping-lists

Una lista de compra es una plantilla que el usuario reutiliza (supermercado, feria,
cumpleaños, etc.). Se le van agregando productos y marcando cuáles se compraron y a
qué precio. En algún momento se "envía a egreso": se crea un Expense en el período
abierto con el monto = suma de los ítems comprados, y un snapshot de esos ítems queda
guardado en Expense.items — pero la lista en sí NO se modifica ni se cierra, sigue
disponible para la próxima compra. Reiniciarla (desmarcar todo) es una acción aparte.
"""
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
from app.models.transaction import Expense, PaymentStatus, ReviewStatus, TransactionSource
from app.models.catalog import Category
from app.models.period import Period, PeriodStatus
from app.routers.expenses import _build_out as _build_expense_out, ExpenseOut

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
    created_at: datetime
    updated_at: datetime
    last_sent_at: Optional[datetime] = None
    items: list[ShoppingListItemOut] = []
    item_count: int = 0
    purchased_count: int = 0
    pending_send_count: int = 0

    model_config = {"from_attributes": True}


class ShoppingListCreate(BaseModel):
    name: str
    default_category_id: Optional[uuid.UUID] = None


class ShoppingListUpdate(BaseModel):
    name: Optional[str] = None
    default_category_id: Optional[uuid.UUID] = None
    archived: Optional[bool] = None


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


def _snapshot_key(item: ShoppingListItem) -> str:
    return f"id:{item.id}"


def _legacy_snapshot_key(item: ShoppingListItem) -> str:
    return f"label:{item.label}"


def _item_was_sent_in_current_period(item: ShoppingListItem, sent_keys: set[str]) -> bool:
    return _snapshot_key(item) in sent_keys or _legacy_snapshot_key(item) in sent_keys


def _build_item_snapshot(item: ShoppingListItem) -> dict:
    return {
        "id": str(item.id),
        "label": item.label,
        "amount": str(item.quantity * item.unit_price),
    }


def _build_list_out(
    shopping_list: ShoppingList,
    items: list[ShoppingListItem],
    current_period_sent_item_ids: set[str] | None = None,
) -> dict:
    current_period_sent_item_ids = current_period_sent_item_ids or set()
    sent_dates = [i.sent_at for i in items if i.sent_at is not None]
    return {
        "id":                  shopping_list.id,
        "name":                shopping_list.name,
        "default_category_id": shopping_list.default_category_id,
        "archived":            shopping_list.archived,
        "created_at":          shopping_list.created_at,
        "updated_at":          shopping_list.updated_at,
        "last_sent_at":        max(sent_dates) if sent_dates else None,
        "items":               items,
        "item_count":          len(items),
        "purchased_count":     sum(1 for i in items if i.purchased),
        "pending_send_count":  sum(1 for i in items if i.purchased and not _item_was_sent_in_current_period(i, current_period_sent_item_ids)),
    }


async def _sent_item_ids_for_open_period(
    db: AsyncSession,
    user_id: uuid.UUID,
    list_ids: list[uuid.UUID],
) -> dict[uuid.UUID, set[str]]:
    open_period = (await db.execute(
        select(Period).where(
            Period.user_id == user_id,
            Period.status == PeriodStatus.abierto,
        )
    )).scalar_one_or_none()
    if not open_period or not list_ids:
        return {}

    expenses = (await db.execute(
        select(Expense).where(
            Expense.user_id == user_id,
            Expense.period_id == open_period.id,
            Expense.shopping_list_id.in_(list_ids),
        )
    )).scalars().all()

    sent_by_list: dict[uuid.UUID, set[str]] = {}
    for expense in expenses:
        if not expense.shopping_list_id:
            continue
        ids = sent_by_list.setdefault(expense.shopping_list_id, set())
        for item in expense.items or []:
            if not isinstance(item, dict):
                continue
            item_id = item.get("id")
            if item_id:
                ids.add(f"id:{item_id}")
            elif item.get("label"):
                ids.add(f"label:{item['label']}")
    return sent_by_list


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

    sent_by_list = await _sent_item_ids_for_open_period(db, current_user.id, list_ids)
    return [
        _build_list_out(l, items_by_list.get(l.id, []), sent_by_list.get(l.id, set()))
        for l in lists
    ]


@router.post("", response_model=ShoppingListOut, status_code=status.HTTP_201_CREATED)
async def create_shopping_list(
    body: ShoppingListCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    sent_by_list = await _sent_item_ids_for_open_period(db, current_user.id, [list_id])
    return _build_list_out(shopping_list, items, sent_by_list.get(list_id, set()))


@router.patch("/{list_id}", response_model=ShoppingListOut)
async def update_shopping_list(
    list_id: uuid.UUID,
    body: ShoppingListUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shopping_list = await _get_list_or_404(list_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(shopping_list, field, value)
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
    """Crea un egreso con el monto y el detalle de los ítems marcados como comprados que
    todavía no se hayan enviado (sent_at is null) — así reenviar la misma lista sin haberla
    reiniciado no vuelve a cobrar los mismos productos dos veces. La lista en sí no cambia
    de estado (purchased/unit_price siguen igual); solo se marca sent_at en los ítems
    incluidos. Reiniciar la lista (POST /{list_id}/reset) limpia también sent_at."""
    open_period = await _get_open_period(db, current_user.id)
    shopping_list = await _get_list_or_404(list_id, current_user.id, db)
    items = await _load_items(db, list_id)

    existing_expense = (await db.execute(
        select(Expense)
        .where(
            Expense.user_id == current_user.id,
            Expense.period_id == open_period.id,
            Expense.shopping_list_id == shopping_list.id,
        )
        .order_by(Expense.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    current_period_sent_item_ids = {
        f"id:{item['id']}" if item.get("id") else f"label:{item['label']}"
        for item in (existing_expense.items or [])
        if isinstance(item, dict) and (item.get("id") or item.get("label"))
    } if existing_expense else set()

    purchased_items = [
        i for i in items
        if i.purchased and not _item_was_sent_in_current_period(i, current_period_sent_item_ids)
    ]
    if not purchased_items:
        raise HTTPException(
            status_code=400,
            detail="No hay productos nuevos marcados como comprados para enviar. "
                   "Si ya enviaste esta lista, reinícia los productos que quieras volver a comprar.",
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
    expense = existing_expense

    if expense:
        expense.date = body.date
        expense.label = body.label or shopping_list.name
        expense.category_id = category_id
        expense.amount = expense.amount + amount
        expense.items = [*(expense.items or []), *snapshot]
        expense.observation = body.observation
        expense.responsible_tag = body.responsible_tag
        expense.payment_status = PaymentStatus.saldado
        expense.review_status = ReviewStatus.confirmado
    else:
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
            observation=body.observation,
            responsible_tag=body.responsible_tag,
        )
        db.add(expense)
    for item in purchased_items:
        item.sent_at = datetime.utcnow()
    await db.commit()
    await db.refresh(expense)
    return _build_expense_out(expense, cat, 0)
