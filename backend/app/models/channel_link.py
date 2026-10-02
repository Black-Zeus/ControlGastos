import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, DateTime, Enum as SAEnum, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.models.base import Base, uuid_pk, created_at_col

if TYPE_CHECKING:
    from app.models.user import User


class Channel(str, enum.Enum):
    telegram = "telegram"
    whatsapp = "whatsapp"


class UserChannelLink(Base):
    """
    Identidad de canal vinculada a un usuario (ver app.routers.channels).
    Una vez vinculado, el (channel, channel_id) autentica directamente al
    submódulo de ingesta — sin token — porque n8n ya trae ambos datos en
    cada mensaje entrante.
    """
    __tablename__ = "user_channel_links"
    __table_args__ = (
        UniqueConstraint("channel", "channel_id", name="uq_channel_link_channel_id"),
        Index("ix_channel_link_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[Channel] = mapped_column(SAEnum(Channel, name="channel_type"), nullable=False)
    channel_id: Mapped[str] = mapped_column(String(255), nullable=False)  # chat_id de Telegram / número de WhatsApp
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)  # ej. número visible, @usuario
    linked_at: Mapped[datetime] = created_at_col()

    user: Mapped["User"] = relationship("User")


class ChannelLinkCode(Base):
    """
    Código de emparejamiento de un solo uso — el usuario lo genera autenticado
    en la web y lo envía por el canal a vincular; quien lo reciba (n8n) prueba
    con eso que controla ese chat_id/número.
    """
    __tablename__ = "channel_link_codes"
    __table_args__ = (
        Index("ix_channel_link_codes_code", "code", unique=True),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[Channel] = mapped_column(SAEnum(Channel, name="channel_type"), nullable=False)
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    user: Mapped["User"] = relationship("User")
