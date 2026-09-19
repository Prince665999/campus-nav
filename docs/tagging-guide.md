### A note on `landmark=yes`

Every named thing on this campus map today is a thing the map author
deliberately chose to name. That means every named area is treated as
a landmark by default — no `landmark=yes` tag is required.

The tag exists for the future, when:

- The map is being tagged by more than one person and not everyone
  agrees on what's worth naming.
- The narration starts feeling noisy because too many areas are being
  mentioned.
- Some areas are tagged for completeness (parking lots, utility
  plots) but shouldn't appear in directions.

When any of those becomes true, flip the default in `ingest.py` and
`reimport.py` from "everything unless landmark=no" to "nothing unless
landmark=yes", and start tagging deliberately. Until then, every
named area is a landmark.