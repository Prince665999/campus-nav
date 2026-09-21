"""
media.py

Endpoints for uploading and listing photos.
"""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..errors import BadRequestError, NotFoundError
from ..schemas.media import MediaItem, MediaUploadResponse
from ..services import media_service
from ..services.media_service import MediaError

router = APIRouter(prefix="/api/media", tags=["media"])


def _to_item(media) -> MediaItem:
    return MediaItem(
        id=media.id,
        place_id=media.place_id,
        kind=media.kind,
        bearing_deg=media.bearing_deg,
        credit=media.credit,
        is_primary=media.is_primary,
        sort_order=media.sort_order,
        url_thumb=media_service.url_for(media, "thumb"),
        url_card=media_service.url_for(media, "card"),
        url_full=media_service.url_for(media, "full"),
    )


@router.get("/place/{place_id}", response_model=list[MediaItem])
def list_media_for_place(place_id: int, session: Session = Depends(db_session)):
    """All media for one place, primary first."""
    items = media_service.list_for_place(session, place_id)
    return [_to_item(m) for m in items]


@router.post("", response_model=MediaUploadResponse, status_code=201)
async def upload_media(
    place_id: int = Form(...),
    kind: str = Form("approach"),
    bearing_deg: int | None = Form(None),
    credit: str | None = Form(None),
    is_primary: bool = Form(False),
    sort_order: int = Form(0),
    file: UploadFile = File(...),
    session: Session = Depends(db_session),
):
    """
    Upload one photo. Called by the admin CLI and later by the admin
    site's photo manager. Not exposed to students.
    """
    contents = await file.read()

    try:
        media = media_service.upload(
            session,
            place_id=place_id,
            file_bytes=contents,
            kind=kind,
            bearing_deg=bearing_deg,
            credit=credit,
            is_primary=is_primary,
            sort_order=sort_order,
        )
    except Exception as e:
        if e.__class__.__name__ == "MediaError":
            raise BadRequestError(str(e)) from e

    session.flush()  # assign the id before we return it
    return MediaUploadResponse(
        id=media.id,
        place_id=media.place_id,
        kind=media.kind,
        url_card=media_service.url_for(media, "card"),
    )


@router.delete("/{media_id}", status_code=204)
def delete_media(media_id: int, session: Session = Depends(db_session)):
    """Delete a photo and its files. Admin only."""
    ok = media_service.delete(session, media_id)
    if not ok:
        raise NotFoundError(f"Media {media_id} not found")
    return None