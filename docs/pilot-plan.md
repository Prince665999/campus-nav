# Pilot Plan

## Purpose

Test the app with real students before wider release. The pilot's job
is to answer three questions:

1. Do students actually use it?
2. Do the directions work on the ground?
3. What breaks that we didn't anticipate?

A pilot is not a launch. It's a test with a small, forgiving audience
whose feedback improves the app before a bigger audience sees it.

## Cohort

**15 to 25 first-year students.** This is deliberate:

- First-years don't know the campus yet. They have a real need for
  the app. A pilot with fourth-years teaches you nothing — they
  already know where everything is.
- They're at orientation, so they're physically on campus and
  walking around.
- They have a shared context — they're all trying to find the same
  places (cafeteria, lecture halls, library, hostels) in the same
  first week.

If you can't reach first-years, use new staff or visitors. Anyone who
genuinely doesn't know the campus.

## Timing

Run the pilot **during orientation week**, before the first day of
classes. Reasons:

- Students are on campus with time to explore.
- They're actively looking for the places the app helps find.
- There's a natural feedback moment at the end of orientation —
  "did this help?"

Run it for **three to five days**. Shorter and you don't get enough
usage. Longer and you're spending pilot time on polish.

## What to set up before the pilot

1. **The backend is deployed** with a public URL. Students can't run
   the API on your laptop.
2. **`MEDIA_BASE_URL` points at the public domain**, so photos load.
3. **The map has at least 20 photographed places**, covering the
   buildings first-years actually need.
4. **The map has `name:sw` on at least 15 places**, so Kiswahili
   search works for the students who use it.
5. **A build is installed** on each pilot phone. See the EAS build
   step below.
6. **A feedback form or channel exists.** A Google Form is fine.
   A WhatsApp group works well for a campus cohort.

## EAS build

Build a preview version of the mobile app for the pilot:

    cd mobile
    eas build --platform android --profile preview

This creates an APK that installs directly. Share the QR code with
the pilot students, or install it on their phones for them at
orientation check-in.

For iOS, use `eas build --platform ios --profile preview`. iOS
requires the device to be registered with an Apple developer
account unless you use TestFlight.

## What to ask students

Three questions, at the end of the pilot:

1. **Did you use the app to find a place you didn't know?** (yes/no)
2. **Did the directions work?** (yes / mostly / no)
3. **Anything you'd change?**

For a deeper look, ask five students to walk a specific route with
you and talk out loud about what they see. The things they notice
that aren't on the map, the things the map says that aren't there —
that's where the real feedback is.

## What to watch in the data

The admin site's analytics and the database hold the signals:

- **Failed searches.** Queries that returned no results tell you
  which aliases to add. If ten students searched "cafeteria" and the
  place is called "Dining Hall", that's a five-second fix with a
  big impact.
- **Routes abandoned mid-walk.** A route that gets started and
  never reaches arrival usually means the directions were wrong.
  Look at the timeline for that route.
- **Reports.** The report queue is the direct signal. Triage
  daily during the pilot.
- **Media.** Photos that students ignore might be bad photos.
  Photos that students photograph themselves might be missing.
- **Arrival feedback.** Thumbs-down on arrival, with the route
  they took, points at narration problems.

## What to fix during the pilot

Keep a running list. Sort by frequency, not by severity. A small
bug that ten students hit matters more than a big bug that one
student hit once.

Typical pilot fixes:

- Adding `alt_name` tags for the names students actually use.
- Rewriting narration that reads awkwardly on the ground.
- Correcting photos that were taken at the wrong angle.
- Adding a missing path that everyone wants to use but which
  isn't on the map yet.

## What not to do during the pilot

- **Don't add features.** The pilot tests what exists. New features
  are for after.
- **Don't change the map every day.** Pick a time — end of each
  day — to run a re-import with the day's fixes. Constant changes
  make it impossible to know what students actually saw.
- **Don't over-explain.** If the students don't figure out the
  search bar without help, the search bar needs work, not a
  tutorial.

## After the pilot

1. **Write down what you learned.** A one-page summary, kept in
   `docs/`, goes a long way when you're deciding what to build next.
2. **Fix the top five issues.** Small, concrete fixes that address
   what most students hit.
3. **Decide whether to roll out further.** If the pilot worked,
   the next step is a wider release — through the campus app store,
   a QR code on posters, or word of mouth. If it didn't, the pilot
   feedback tells you what to fix before trying again.

## Success criteria

The pilot is a success if:

- At least **half of the pilot students used it more than twice**.
- At least **half of the routes** they took reached arrival.
- **No critical safety issues** — bad directions, wrong buildings,
  anything that would send a student somewhere dangerous or make
  them miss a lecture.

It's not a success if:

- Students used it once, got lost or confused, and never opened it
  again.
- Directions routinely pointed at the wrong building.
- Nobody remembers to use it because it wasn't useful enough.

Those are signals to fix, not to give up. But they mean the app
isn't ready for a wider release yet.