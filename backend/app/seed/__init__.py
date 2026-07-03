from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.catalog import Category, IncomeType
from app.seed.data import SYSTEM_CATEGORIES, SYSTEM_INCOME_TYPES


async def seed_system_catalogs(db: AsyncSession) -> None:
    """Inserta los catálogos de sistema si no existen. Idempotente."""
    existing_cats = (await db.execute(
        select(Category).where(Category.is_system.is_(True))
    )).scalars().all()
    existing_names = {c.name for c in existing_cats}

    for entry in SYSTEM_CATEGORIES:
        if entry["name"] not in existing_names:
            db.add(Category(is_system=True, user_id=None, **entry))

    existing_types = (await db.execute(
        select(IncomeType).where(IncomeType.is_system.is_(True))
    )).scalars().all()
    existing_type_names = {t.name for t in existing_types}

    for entry in SYSTEM_INCOME_TYPES:
        if entry["name"] not in existing_type_names:
            db.add(IncomeType(is_system=True, user_id=None, **entry))

    await db.commit()
