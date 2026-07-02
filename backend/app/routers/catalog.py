"""
Catálogos para el usuario autenticado — /api/v1/categories y /api/v1/income-types

Reglas de negocio:
  1. GET devuelve la vista unificada: categorías de sistema + propias del usuario,
     con el estado de activación efectivo (override del usuario o default del sistema).
  2. El usuario puede crear sus propias categorías (user_id = current_user.id).
  3. Toggle de activación:
       - Categoría de sistema → crea/actualiza UserCategoryConfig.
       - Categoría propia     → actualiza Category.default_active directamente.
  4. DELETE solo está permitido para categorías propias (is_system=False, user_id=current_user.id).
     Las categorías de sistema no se pueden eliminar.
  5. Mismo patrón para income_types.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.catalog import (
    Category, CategoryType, UserCategoryConfig,
    IncomeType, UserIncomeTypeConfig,
)
from app.models.transaction import Income, Expense

router = APIRouter(tags=["catalogs"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: uuid.UUID
    is_system: bool
    name: str
    type: CategoryType
    default_obviable: bool
    description: str | None
    active: bool  # estado efectivo para este usuario

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str
    type: CategoryType
    default_obviable: bool = False
    description: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    type: CategoryType | None = None
    default_obviable: bool | None = None
    description: str | None = None


class IncomeTypeOut(BaseModel):
    id: uuid.UUID
    is_system: bool
    name: str
    active: bool

    model_config = {"from_attributes": True}


class IncomeTypeCreate(BaseModel):
    name: str

class IncomeTypeUpdate(BaseModel):
    name: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_user_categories(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Devuelve todas las categorías visibles para el usuario con active efectivo."""
    cats = (await db.execute(
        select(Category).where(
            (Category.is_system.is_(True)) | (Category.user_id == user_id)
        ).order_by(Category.is_system.desc(), Category.name)
    )).scalars().all()

    configs = {
        c.category_id: c.active
        for c in (await db.execute(
            select(UserCategoryConfig).where(UserCategoryConfig.user_id == user_id)
        )).scalars().all()
    }

    result = []
    for cat in cats:
        if cat.is_system:
            effective_active = configs.get(cat.id, cat.default_active)
        else:
            effective_active = cat.default_active
        result.append({**cat.__dict__, "active": effective_active})
    return result


async def _get_user_income_types(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    types = (await db.execute(
        select(IncomeType).where(
            (IncomeType.is_system.is_(True)) | (IncomeType.user_id == user_id)
        ).order_by(IncomeType.is_system.desc(), IncomeType.name)
    )).scalars().all()

    configs = {
        c.income_type_id: c.active
        for c in (await db.execute(
            select(UserIncomeTypeConfig).where(UserIncomeTypeConfig.user_id == user_id)
        )).scalars().all()
    }

    result = []
    for it in types:
        if it.is_system:
            effective_active = configs.get(it.id, it.default_active)
        else:
            effective_active = it.default_active
        result.append({**it.__dict__, "active": effective_active})
    return result


# ─── Categorías de egreso ─────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_user_categories(db, current_user.id)


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = Category(is_system=False, user_id=current_user.id, **body.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return {**cat.__dict__, "active": cat.default_active}


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = (await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == current_user.id,
            Category.is_system.is_(False),
        )
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada o no modificable")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.commit()
    await db.refresh(cat)
    return {**cat.__dict__, "active": cat.default_active}


@router.patch("/categories/{category_id}/toggle")
async def toggle_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Activa o desactiva una categoría para el usuario actual."""
    cat = (await db.execute(
        select(Category).where(
            (Category.is_system.is_(True)) | (Category.user_id == current_user.id),
            Category.id == category_id,
        )
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    if cat.is_system:
        config = (await db.execute(
            select(UserCategoryConfig).where(
                UserCategoryConfig.user_id == current_user.id,
                UserCategoryConfig.category_id == category_id,
            )
        )).scalar_one_or_none()

        current_active = config.active if config else cat.default_active
        if config:
            config.active = not current_active
        else:
            db.add(UserCategoryConfig(
                user_id=current_user.id,
                category_id=category_id,
                active=not current_active,
            ))
        new_active = not current_active
    else:
        cat.default_active = not cat.default_active
        new_active = cat.default_active

    await db.commit()
    return {"id": category_id, "active": new_active}


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = (await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == current_user.id,
            Category.is_system.is_(False),
        )
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(
            status_code=404,
            detail="Categoría no encontrada. Las categorías de sistema no pueden eliminarse.",
        )
    has_expenses = (await db.execute(
        select(Expense.id).where(Expense.category_id == category_id).limit(1)
    )).scalar_one_or_none()
    if has_expenses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar esta categoría porque tiene egresos asociados.",
        )
    await db.delete(cat)
    await db.commit()


# ─── Tipos de ingreso ─────────────────────────────────────────────────────────

@router.get("/income-types", response_model=list[IncomeTypeOut])
async def list_income_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_user_income_types(db, current_user.id)


@router.post("/income-types", response_model=IncomeTypeOut, status_code=status.HTTP_201_CREATED)
async def create_income_type(
    body: IncomeTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    it = IncomeType(is_system=False, user_id=current_user.id, name=body.name)
    db.add(it)
    await db.commit()
    await db.refresh(it)
    return {**it.__dict__, "active": it.default_active}


@router.patch("/income-types/{income_type_id}", response_model=IncomeTypeOut)
async def update_income_type(
    income_type_id: uuid.UUID,
    body: IncomeTypeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    it = (await db.execute(
        select(IncomeType).where(
            IncomeType.id == income_type_id,
            IncomeType.user_id == current_user.id,
            IncomeType.is_system.is_(False),
        )
    )).scalar_one_or_none()
    if not it:
        raise HTTPException(status_code=404, detail="Tipo de ingreso no encontrado o no editable.")
    it.name = body.name.strip()
    await db.commit()
    await db.refresh(it)
    config = (await db.execute(
        select(UserIncomeTypeConfig).where(
            UserIncomeTypeConfig.income_type_id == income_type_id,
            UserIncomeTypeConfig.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    active = config.active if config else it.default_active
    return {**it.__dict__, "active": active}


@router.patch("/income-types/{income_type_id}/toggle")
async def toggle_income_type(
    income_type_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    it = (await db.execute(
        select(IncomeType).where(
            (IncomeType.is_system.is_(True)) | (IncomeType.user_id == current_user.id),
            IncomeType.id == income_type_id,
        )
    )).scalar_one_or_none()
    if not it:
        raise HTTPException(status_code=404, detail="Tipo de ingreso no encontrado")

    if it.is_system:
        config = (await db.execute(
            select(UserIncomeTypeConfig).where(
                UserIncomeTypeConfig.user_id == current_user.id,
                UserIncomeTypeConfig.income_type_id == income_type_id,
            )
        )).scalar_one_or_none()

        current_active = config.active if config else it.default_active
        if config:
            config.active = not current_active
        else:
            db.add(UserIncomeTypeConfig(
                user_id=current_user.id,
                income_type_id=income_type_id,
                active=not current_active,
            ))
        new_active = not current_active
    else:
        it.default_active = not it.default_active
        new_active = it.default_active

    await db.commit()
    return {"id": income_type_id, "active": new_active}


@router.delete("/income-types/{income_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_income_type(
    income_type_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    it = (await db.execute(
        select(IncomeType).where(
            IncomeType.id == income_type_id,
            IncomeType.user_id == current_user.id,
            IncomeType.is_system.is_(False),
        )
    )).scalar_one_or_none()
    if not it:
        raise HTTPException(
            status_code=404,
            detail="Tipo de ingreso no encontrado. Los tipos de sistema no pueden eliminarse.",
        )
    has_incomes = (await db.execute(
        select(Income.id).where(Income.income_type_id == income_type_id).limit(1)
    )).scalar_one_or_none()
    if has_incomes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar este tipo porque tiene ingresos asociados.",
        )
    await db.delete(it)
    await db.commit()
