"""
Cliente MinIO sincrónico; usar run_in_executor para llamadas async.
"""
import io
import functools
from minio import Minio
from app.config import get_settings


@functools.lru_cache(maxsize=1)
def _client() -> Minio:
    s = get_settings()
    return Minio(
        s.minio_endpoint,
        access_key=s.minio_access_key,
        secret_key=s.minio_secret_key,
        secure=s.minio_use_ssl,
    )


def _ensure_bucket() -> str:
    bucket = get_settings().minio_bucket
    c = _client()
    if not c.bucket_exists(bucket):
        c.make_bucket(bucket)
    return bucket


def upload_bytes(content: bytes, key: str, content_type: str) -> None:
    bucket = _ensure_bucket()
    _client().put_object(
        bucket, key, io.BytesIO(content), length=len(content), content_type=content_type
    )


def download_bytes(key: str) -> tuple[bytes, str]:
    bucket = _ensure_bucket()
    resp = _client().get_object(bucket, key)
    try:
        data = resp.read()
        ct = resp.headers.get("content-type", "application/octet-stream")
    finally:
        resp.close()
        resp.release_conn()
    return data, ct


def delete_object(key: str) -> None:
    bucket = _ensure_bucket()
    _client().remove_object(bucket, key)
