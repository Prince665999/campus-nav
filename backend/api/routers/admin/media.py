"""
media.py

Admin endpoints for uploading and deleting photos.

Upload is a duplicate of the public POST /api/media, kept under
/api/admin so it's protected by the admin guard. The public endpoint
stays open for backwards compatibility with the CLI script from
Phase 8.
"""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...errors import BadRequestError, NotFoundError
from ...schemas.media import MediaUploadResponse
from ...services import media_service
from ...services.media_service import MediaError

router = APIRouter(prefix="/media", tags=["admin:media"])


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
    """Upload a photo. Same behaviour as POST /api/media."""
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
        raise

    session.flush()
    return MediaUploadResponse(
        id=media.id,
        place_id=media.place_id,
        kind=media.kind,
        url_card=media_service.url_for(media, "card"),
    )


@router.delete("/{media_id}", status_code=204)
def delete_media(media_id: int, session: Session = Depends(db_session)):
    """Delete a photo and its files."""
    ok = media_service.delete(session, media_id)
    if not ok:
        raise NotFoundError(f"Media {media_id} not found")
    return None