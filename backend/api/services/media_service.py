"""
media_service.py

Handles image upload, processing, and lookup.

On upload:
  1. Validate the file is actually an image and within size limits.
  2. Open it with Pillow.
  3. Strip EXIF metadata (privacy — photos contain GPS coordinates).
  4. Auto-rotate based on EXIF orientation, so portrait photos
     aren't shown sideways.
  5. Generate three resized variants (thumb, card, full), each saved
     as WebP.
  6. Write a media row referencing them.

Files are stored under MEDIA_DIR as:
    <place_id>/<hash>_thumb.webp
    <place_id>/<hash>_card.webp
    <place_id>/<hash>_full.webp

The <hash> is a short SHA-256 of the file contents, so re-uploading
the same photo doesn't create duplicates.
"""

import hashlib
import io
import os

from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from backend.api.models.media import Media
from backend.api.models.place import Place
from backend.api.settings import (
    MEDIA_BASE_URL,
    MEDIA_DIR,
    MEDIA_MAX_UPLOAD_BYTES,
    MEDIA_VARIANTS,
)


class MediaError(Exception):
    """Raised for any media upload failure the caller should report."""


# ---------------------------------------------------------------------------
# File storage
# ---------------------------------------------------------------------------

def _hash_bytes(data: bytes) -> str:
    """Short, deterministic hash of the file contents."""
    return hashlib.sha256(data).hexdigest()[:16]


def _variant_path(prefix: str, variant_name: str) -> "os.PathLike":
    """Full filesystem path for one variant of one photo."""
    return MEDIA_DIR / f"{prefix}_{variant_name}.webp"


def _stored_url(prefix: str, variant_name: str) -> str:
    """Public URL for one variant of one photo."""
    # The prefix is like "3/abc123def". The route that serves these
    # files is mounted at /media.
    return f"{MEDIA_BASE_URL}/media/{prefix}_{variant_name}.webp"


def url_for(media: Media, variant: str = "card") -> str:
    """URL for one variant of an existing media row."""
    return _stored_url(media.stored_path_prefix, variant)


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

def _process_image(data: bytes) -> dict:
    """
    Open the image, apply orientation, strip metadata, and produce
    three resized WebP byte buffers.

    Returns {variant_name: bytes}. Raises MediaError on any failure.
    """
    if len(data) > MEDIA_MAX_UPLOAD_BYTES:
        mb = MEDIA_MAX_UPLOAD_BYTES // (1024 * 1024)
        raise MediaError(f"File is larger than {mb} MB")

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:
        raise MediaError(f"Not a valid image: {e}") from e

    # Apply EXIF orientation so portrait photos aren't sideways.
    # This is what ImageOps.exif_transpose does.
    img = ImageOps.exif_transpose(img)

    # Convert to RGB. Handles RGBA, P, and grayscale sources so WebP
    # save doesn't fail on an alpha channel it can't encode.
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    variants = {}
    for name, max_dim in MEDIA_VARIANTS:
        # Copy so we don't mutate the original between iterations.
        copy = img.copy()
        # thumbnail() resizes in place, preserving aspect ratio, only
        # shrinking if larger than the given size.
        copy.thumbnail((max_dim, max_dim), Image.LANCZOS)

        buffer = io.BytesIO()
        # quality=82 is the sweet spot for WebP — visually indistinguishable
        # from higher settings at a fraction of the size.
        copy.save(buffer, format="WEBP", quality=82, method=4)
        variants[name] = buffer.getvalue()

    return variants


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def upload(
    session: Session,
    place_id: int,
    file_bytes: bytes,
    *,
    kind: str = "approach",
    bearing_deg: int | None = None,
    credit: str | None = None,
    is_primary: bool = False,
    sort_order: int = 0,
) -> Media:
    """
    Process and store a photo. Returns the new Media row.

    Raises MediaError if the file isn't a valid image or is too large,
    or if the place doesn't exist.
    """
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        raise MediaError(f"Place {place_id} not found")

    if bearing_deg is not None and not (0 <= bearing_deg <= 360):
        raise MediaError("bearing_deg must be between 0 and 360")

    variants = _process_image(file_bytes)

    # Build the storage prefix. Group by place so the folder tree
    # stays small.
    content_hash = _hash_bytes(file_bytes)
    prefix = f"{place_id}/{content_hash}"

    # Write each variant to disk. If any write fails, the exception
    # propagates and the transaction rolls back — no partial rows.
    for name, buf in variants.items():
        path = _variant_path(prefix, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(buf)

    media = Media(
        place_id=place_id,
        stored_path_prefix=prefix,
        kind=kind,
        bearing_deg=bearing_deg,
        credit=credit,
        is_primary=is_primary,
        sort_order=sort_order,
    )
    session.add(media)
    return media


def list_for_place(session: Session, place_id: int) -> list[Media]:
    """
    All media for a place, primary first, then by sort_order.
    """
    return (
        session.query(Media)
        .filter_by(place_id=place_id)
        .order_by(Media.is_primary.desc(), Media.sort_order.asc(), Media.id.asc())
        .all()
    )


def delete(session: Session, media_id: int) -> bool:
    """
    Delete a media row and its files. Returns True if it existed.
    """
    media = session.query(Media).filter_by(id=media_id).one_or_none()
    if media is None:
        return False

    for name, _dim in MEDIA_VARIANTS:
        path = _variant_path(media.stored_path_prefix, name)
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            # Keep going — the row delete matters more than the file.
            pass

    session.delete(media)
    return True


def closest_by_bearing(media_list: list[Media], target_bearing: int) -> Media | None:
    """
    From a list of media, return the one whose bearing_deg is closest
    to target_bearing. Wraps around at 0/360.

    Used in Phase 8's mobile work: given the direction the student is
    approaching from, pick the photo that was taken facing them.
    """
    if not media_list:
        return None

    with_bearing = [m for m in media_list if m.bearing_deg is not None]
    if not with_bearing:
        # Nothing has a bearing. Fall back to the first item.
        return media_list[0]

    def angular_distance(a: int, b: int) -> int:
        d = abs(a - b) % 360
        return min(d, 360 - d)

    return min(with_bearing, key=lambda m: angular_distance(m.bearing_deg, target_bearing))