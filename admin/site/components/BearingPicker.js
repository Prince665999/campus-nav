// A compass-direction picker for photo bearings.
//
// The bearing is the compass direction the camera was facing when the
// photo was taken. The mobile app uses it to pick the approach photo
// that best matches the direction the student is walking from.
//
// This is a simple 8-direction picker: N, NE, E, SE, S, SW, W, NW.
// More precision (0–360 slider) would be nicer but a photo taken
// "roughly east" is good enough for the purpose.

const DIRECTIONS = [
  { label: 'N', value: 0 },
  { label: 'NE', value: 45 },
  { label: 'E', value: 90 },
  { label: 'SE', value: 135 },
  { label: 'S', value: 180 },
  { label: 'SW', value: 225 },
  { label: 'W', value: 270 },
  { label: 'NW', value: 315 },
];

export function BearingPicker({ value, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {DIRECTIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            className={`btn ${value === d.value ? '' : 'btn-secondary'}`}
            style={{ padding: '6px 12px', fontSize: 13 }}
            onClick={() => onChange(d.value)}
          >
            {d.label}
          </button>
        ))}
        <button
          type="button"
          className={`btn ${value === null ? '' : 'btn-secondary'}`}
          style={{ padding: '6px 12px', fontSize: 13 }}
          onClick={() => onChange(null)}
        >
          Unknown
        </button>
      </div>
      {value != null ? (
        <div className="form-hint">{value}° from north</div>
      ) : (
        <div className="form-hint">
          Direction not known. Photo will still show, but the app can't
          pick the closest match.
        </div>
      )}
    </div>
  );
}