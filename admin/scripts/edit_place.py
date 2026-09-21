"""
edit_place.py

CLI for uploading photos to a place and editing place metadata.

Usage:

    # Upload an approach photo of the place with ID 3, taken facing
    # east (90 degrees).
    python admin/scripts/edit_place.py upload-photo \\
        --place-id 3 \\
        --file C:\\photos\\library_approach.jpg \\
        --kind approach \\
        --bearing 90

    # List a place's photos.
    python admin/scripts/edit_place.py list-photos --place-id 3

    # Edit a place's description.
    python admin/scripts/edit_place.py set-description \\
        --place-id 3 --text "The main library, open until 10pm."

Run from the repo root so the backend package resolves.
"""

import argparse
import sys
from pathlib import Path

# Repo root on sys.path so `backend...` imports resolve.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.api.db.init_db import init_db
from backend.api.db.session import session_scope
from backend.api.models.media import Media
from backend.api.models.place import Place
from backend.api.services import media_service
from backend.api.services.media_service import MediaError


def _require_place(session, place_id):
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        print(f"Place {place_id} not found.")
        sys.exit(1)
    return place


def cmd_upload_photo(args):
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"File not found: {file_path}")
        sys.exit(1)

    init_db()
    with session_scope() as session:
        _require_place(session, args.place_id)

        try:
            media = media_service.upload(
                session,
                place_id=args.place_id,
                file_bytes=file_path.read_bytes(),
                kind=args.kind,
                bearing_deg=args.bearing,
                credit=args.credit,
                is_primary=args.primary,
                sort_order=args.order,
            )
        except MediaError as e:
            print(f"Upload failed: {e}")
            sys.exit(1)

        session.flush()
        print(f"Uploaded media id={media.id} for place {media.place_id}.")
        print(f"  card: {media_service.url_for(media, 'card')}")


def cmd_list_photos(args):
    init_db()
    with session_scope() as session:
        _require_place(session, args.place_id)
        items = media_service.list_for_place(session, args.place_id)

        if not items:
            print("No photos for this place.")
            return

        for m in items:
            primary = " [primary]" if m.is_primary else ""
            bearing = f" bearing={m.bearing_deg}" if m.bearing_deg is not None else ""
            print(f"  id={m.id} kind={m.kind}{bearing}{primary}")
            print(f"    {media_service.url_for(m, 'card')}")


def cmd_set_description(args):
    init_db()
    with session_scope() as session:
        place = _require_place(session, args.place_id)
        place.description = args.text
        print(f"Updated description for {place.name}.")


def cmd_delete_photo(args):
    init_db()
    with session_scope() as session:
        ok = media_service.delete(session, args.media_id)
        if ok:
            print(f"Deleted media {args.media_id}.")
        else:
            print(f"Media {args.media_id} not found.")
            sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Edit places and media.")
    sub = parser.add_subparsers(dest="command", required=True)

    # upload-photo
    p = sub.add_parser("upload-photo", help="Upload a photo for a place.")
    p.add_argument("--place-id", type=int, required=True)
    p.add_argument("--file", required=True, help="Path to the image file.")
    p.add_argument(
        "--kind",
        default="approach",
        choices=["approach", "entrance", "detail"],
    )
    p.add_argument(
        "--bearing",
        type=int,
        default=None,
        help="Compass direction the camera was facing, 0-360.",
    )
    p.add_argument("--credit", default=None)
    p.add_argument("--primary", action="store_true")
    p.add_argument("--order", type=int, default=0)
    p.set_defaults(func=cmd_upload_photo)

    # list-photos
    p = sub.add_parser("list-photos", help="List a place's photos.")
    p.add_argument("--place-id", type=int, required=True)
    p.set_defaults(func=cmd_list_photos)

    # set-description
    p = sub.add_parser("set-description", help="Set a place's description.")
    p.add_argument("--place-id", type=int, required=True)
    p.add_argument("--text", required=True)
    p.set_defaults(func=cmd_set_description)

    # delete-photo
    p = sub.add_parser("delete-photo", help="Delete one photo.")
    p.add_argument("--media-id", type=int, required=True)
    p.set_defaults(func=cmd_delete_photo)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()