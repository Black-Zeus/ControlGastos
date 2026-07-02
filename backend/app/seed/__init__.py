from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.catalog import Category, IncomeType
from app.models.user import User
from app.seed.data import SYSTEM_CATEGORIES, SYSTEM_INCOME_TYPES
from app.auth.jwt import hash_password
from app.config import get_settings


async def seed_admin_user(db: AsyncSession) -> None:
    settings = get_settings()
    exists = (await db.execute(
        select(User).where(User.email == settings.admin_email)
    )).scalar_one_or_none()
    if not exists:
        db.add(User(
            email=settings.admin_email,
            password_hash=hash_password(settings.admin_password),
            name=settings.admin_name,
            is_admin=True,
            is_active=True,
            must_change_password=True,
        ))
        await db.commit()


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
