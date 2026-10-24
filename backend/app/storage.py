"""File storage interface and implementations for Notice to Action.

Provides a unified FileStorage abstraction supporting:
- LocalFileStorage: private local directory storage with UUID safe filenames.
- SupabaseFileStorage: extensible class ready for future Supabase bucket integration.
"""

import os
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from backend.app.config import get_settings


class FileStorage(ABC):
    """Abstract base class for notice document file storage."""

    @abstractmethod
    def save(self, filename: str, contents: bytes) -> str:
        """Persist file contents and return the stored file path or identifier.

        Args:
            filename: Original user filename (for metadata/extension determination).
            contents: Raw binary file bytes.

        Returns:
            String representing the storage key or on-disk path.
        """
        pass

    @abstractmethod
    def read(self, stored_path: str) -> bytes:
        """Read and return raw file contents from storage.

        Args:
            stored_path: Identifier or file path returned from save().

        Returns:
            Binary contents of the file.
        """
        pass

    @abstractmethod
    def delete(self, stored_path: str) -> bool:
        """Permanently delete file from storage.

        Args:
            stored_path: Identifier or file path returned from save().

        Returns:
            True if file was deleted or already absent.
        """
        pass

    @abstractmethod
    def get_local_path(self, stored_path: str) -> Path:
        """Resolve storage identifier to a local filesystem Path.

        Used for pipeline extraction and controlled FileResponse streaming.
        """
        pass


class LocalFileStorage(FileStorage):
    """Local filesystem storage saving files to a private, non-public directory."""

    def __init__(self, upload_dir: str | Path | None = None) -> None:
        settings = get_settings()
        self.upload_dir = Path(upload_dir or settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def save(self, filename: str, contents: bytes) -> str:
        """Save file bytes with a generated safe UUID filename outside public paths."""
        safe_filename = f"{uuid.uuid4().hex}.pdf"
        target_path = self.upload_dir / safe_filename
        target_path.write_bytes(contents)
        return str(target_path.resolve())

    def read(self, stored_path: str) -> bytes:
        """Read file bytes from local disk."""
        path = Path(stored_path)
        if not path.exists():
            raise FileNotFoundError(f"Stored file '{stored_path}' not found on disk.")
        return path.read_bytes()

    def delete(self, stored_path: str) -> bool:
        """Delete local file from disk."""
        path = Path(stored_path)
        if path.exists():
            try:
                os.remove(path)
                return True
            except OSError:
                return False
        return True

    def get_local_path(self, stored_path: str) -> Path:
        """Return Path object for local file."""
        return Path(stored_path)


class SupabaseFileStorage(FileStorage):
    """Supabase Storage implementation stub (structured for future Supabase bucket activation)."""

    def __init__(self, bucket_name: str = "notices", **kwargs: Any) -> None:
        self.bucket_name = bucket_name
        self.kwargs = kwargs

    def save(self, filename: str, contents: bytes) -> str:
        raise NotImplementedError(
            "Supabase Storage backend is planned for future phases. Use STORAGE_BACKEND=local."
        )

    def read(self, stored_path: str) -> bytes:
        raise NotImplementedError(
            "Supabase Storage backend is planned for future phases. Use STORAGE_BACKEND=local."
        )

    def delete(self, stored_path: str) -> bool:
        raise NotImplementedError(
            "Supabase Storage backend is planned for future phases. Use STORAGE_BACKEND=local."
        )

    def get_local_path(self, stored_path: str) -> Path:
        raise NotImplementedError(
            "Supabase Storage backend is planned for future phases. Use STORAGE_BACKEND=local."
        )


def get_storage(
    backend: str | None = None,
    upload_dir: str | Path | None = None,
) -> FileStorage:
    """Factory selecting the FileStorage implementation based on configuration."""
    settings = get_settings()
    selected_backend = (backend or settings.STORAGE_BACKEND).lower().strip()

    if selected_backend == "local":
        return LocalFileStorage(upload_dir=upload_dir)
    elif selected_backend in ("supabase", "supabase_storage"):
        return SupabaseFileStorage()
    else:
        raise ValueError(
            f"Unsupported STORAGE_BACKEND '{selected_backend}'. Supported options are: 'local', 'supabase'."
        )
