from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Float, Integer, String
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class NoticeModel(Base):
    """SQLAlchemy model for storing processed notice records and schema metadata."""

    __tablename__ = "notices"

    id = Column(String(64), primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    category = Column(String(32), index=True, nullable=False)
    category_confidence = Column(Float, nullable=False, default=0.0)
    document_quality = Column(String(32), default="good")

    # Full structured JSON complying with notice.schema.json v1.0
    payload = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
