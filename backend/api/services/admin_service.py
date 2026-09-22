"""
admin_service.py

Helpers shared across admin endpoints.
"""


# Which OSM tag becomes a place's `category`. Ordered: first present
# wins. Same list as ingest.py uses.
_CATEGORY_TAGS = (
    "amenity",
    "office",
    "building",
    "shop",
    "tourism",
    "leisure",
    "healthcare",
)


def _category_from_tags(tags):
    """First recognised category tag, or None."""
    for key in _CATEGORY_TAGS:
        if key in tags:
            return f"{key}={tags[key]}"
    return None