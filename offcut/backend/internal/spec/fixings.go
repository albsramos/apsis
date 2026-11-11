package spec

import "math"

// Fixings are where the screws, nails and dowels of a spec go, and the holes
// each one needs, worked out from the boards. The model never places them:
// the same rules give the validator what to check and the drawings what to
// show, so a drawn hole is always one that was checked.
//
// A screw or nail goes through the board whose face meets the other's edge
// (a side into the end of a bottom), or, where both faces meet, through the
// board further inside so no heads show. Fixings are spread along the longer
// side of the shared face, EndDistance from each end, centred on the shorter.

// EndDistance is how far the first and last fixing sit from the ends of a
// joint, when the joint is long enough.
const EndDistance = 50.0

// breakOutMargin is the least wood left beyond a screw's tip.
const breakOutMargin = 3.0

type HoleKind string //@name HoleKind

const (
	Clearance HoleKind = "clearance" // through the first board, the screw's diameter
	Pilot     HoleKind = "pilot"     // into the second board, for the thread
	DowelHole HoleKind = "dowel"     // half of a dowel, in each board
)

// Hole is one hole to drill in one part, in assembly coordinates.
type Hole struct {
	Part        string   `json:"part"`
	Kind        HoleKind `json:"kind"`
	At          Vec3     `json:"at"`        // where the drill goes in, on the part's surface
	Axis        string   `json:"axis"`      // x, y or z: the drilling direction
	Direction   int      `json:"direction"` // +1 or -1 along that axis
	Diameter    float64  `json:"diameter"`
	Depth       float64  `json:"depth"`
	Through     bool     `json:"through"`
	Countersink bool     `json:"countersink"`
} //@name Hole

// Fastener is one screw, nail or dowel, from its head (or end) to its tip.
type Fastener struct {
	Start Vec3 `json:"start"`
	Tip   Vec3 `json:"tip"`
} //@name Fastener

// Fixing is how one joint is held: its fasteners and the holes they need.
type Fixing struct {
	Joint     int         `json:"joint"` // index into the spec's joints
	Method    JointMethod `json:"method"`
	Hardware  string      `json:"hardware,omitempty"`
	Through   string      `json:"through"` // the part a screw or nail is driven through; for a dowel, the first part
	Into      string      `json:"into"`
	Axis      string      `json:"axis"`
	Direction int         `json:"direction"`
	// EndDistance is how far the first and last fastener sit from the ends of the joint.
	EndDistance float64    `json:"endDistance"`
	Fasteners   []Fastener `json:"fasteners"`
	Holes       []Hole     `json:"holes"`
} //@name Fixing

var axisNames = [3]string{"x", "y", "z"}

func (v Vec3) at(i int) float64 { return [3]float64{v.X, v.Y, v.Z}[i] }

func (v Vec3) with(i int, f float64) Vec3 {
	switch i {
	case 0:
		v.X = f
	case 1:
		v.Y = f
	default:
		v.Z = f
	}
	return v
}

func (b Box) extent(i int) float64 { lo, hi := b.axis(i); return hi - lo }

func (b Box) center(i int) float64 { lo, hi := b.axis(i); return (lo + hi) / 2 }

// thicknessAxis is the axis a board is thinnest along.
func (b Box) thicknessAxis() int {
	t := 0
	for i := 1; i < 3; i++ {
		if b.extent(i) < b.extent(t) {
			t = i
		}
	}
	return t
}

// meeting returns the axis two touching boxes meet across, and the plane.
func meeting(a, b Box) (axis int, plane float64, ok bool) {
	for i := 0; i < 3; i++ {
		alo, ahi := a.axis(i)
		blo, bhi := b.axis(i)
		if math.Abs(ahi-blo) <= Tolerance {
			return i, ahi, true
		}
		if math.Abs(bhi-alo) <= Tolerance {
			return i, alo, true
		}
	}
	return 0, 0, false
}

// Spread places n fixings along a joint `length` long: EndDistance from each
// end (closer on a short joint), the rest evenly between; one goes in the middle.
func Spread(length float64, n int) []float64 {
	switch {
	case n <= 0:
		return nil
	case n == 1:
		return []float64{math.Round(length / 2)}
	}
	end := math.Min(EndDistance, length/float64(2*n))
	out := make([]float64, n)
	// Whole millimetres: what you'd mark out with a tape.
	for i := range out {
		out[i] = math.Round(end + (length-2*end)*float64(i)/float64(n-1))
	}
	return out
}

// PilotHole is the pilot for a wood screw: about 60% of its diameter, to the
// nearest half millimetre.
func PilotHole(d float64) float64 { return math.Max(1.5, math.Round(d*0.6*2)/2) }

// MaxFaceHoleDepth is the deepest hole to drill into a board's face: two
// thirds of its thickness, so the drill doesn't come out the other side.
func MaxFaceHoleDepth(thickness float64) float64 { return math.Floor(thickness * 2 / 3) }

// Fixings works out every joint's fixings. Joints that can't be placed (the
// parts don't touch, the method needs no fasteners) are left out; the
// validator reports why separately.
func Fixings(s Spec) []Fixing {
	parts := map[string]Part{}
	for _, p := range s.Parts {
		if _, dup := parts[p.ID]; !dup {
			parts[p.ID] = p
		}
	}
	hw := map[string]Hardware{}
	for _, h := range s.Hardware {
		hw[h.ID] = h
	}
	piece := pieceBox(s)
	var out []Fixing
	for i, j := range s.Joints {
		a, okA := parts[j.A]
		b, okB := parts[j.B]
		if !okA || !okB || j.A == j.B {
			continue
		}
		switch j.Method {
		case Screw, BradNail, Dowel, PocketScrew, CamLock:
		default:
			continue
		}
		ba, bb := a.Box(), b.Box()
		if !touching(ba, bb) {
			continue
		}
		axis, plane, ok := meeting(ba, bb)
		if !ok {
			continue
		}
		// Through the board that is thin along the joint; if both are, through
		// the one further inside the piece, so the heads don't show.
		aThin, bThin := ba.thicknessAxis() == axis, bb.thicknessAxis() == axis
		throughA := aThin
		if aThin == bThin {
			mid := piece.center(axis)
			throughA = math.Abs(ba.center(axis)-mid) < math.Abs(bb.center(axis)-mid)
		}
		through, into, bt, bi := a, b, ba, bb
		if !throughA {
			through, into, bt, bi = b, a, bb, ba
		}
		dir := 1
		if bi.center(axis) < bt.center(axis) {
			dir = -1
		}
		outer := bt.Min.at(axis)
		if dir < 0 {
			outer = bt.Max.at(axis)
		}

		// Along the longer side of the shared face, centred on the shorter.
		u, v := (axis+1)%3, (axis+2)%3
		lo := func(k int) float64 { return math.Max(ba.Min.at(k), bb.Min.at(k)) }
		hi := func(k int) float64 { return math.Min(ba.Max.at(k), bb.Max.at(k)) }
		along, across := u, v
		if hi(v)-lo(v) > hi(u)-lo(u) {
			along, across = v, u
		}
		n := max(j.Count, 1)
		offsets := Spread(hi(along)-lo(along), n)
		mid := (lo(across) + hi(across)) / 2
		point := func(at, onAxis float64) Vec3 {
			return Vec3{}.with(axis, onAxis).with(along, lo(along)+at).with(across, mid)
		}

		f := Fixing{
			Joint: i, Method: j.Method, Hardware: j.Hardware, Through: through.ID, Into: into.ID,
			Axis: axisNames[axis], Direction: dir, EndDistance: offsets[0],
			Fasteners: []Fastener{}, Holes: []Hole{},
		}
		h := hw[j.Hardware]
		tT := bt.extent(axis)
		d := float64(dir)
		for _, off := range offsets {
			entry, face := point(off, outer), point(off, plane)
			switch j.Method {
			case Screw, BradNail:
				length := h.Length
				if length <= 0 {
					length = tT * 2
				}
				f.Fasteners = append(f.Fasteners, Fastener{Start: entry, Tip: entry.with(axis, outer+d*length)})
				if j.Method == Screw && h.Diameter > 0 {
					f.Holes = append(f.Holes,
						Hole{Part: through.ID, Kind: Clearance, At: entry, Axis: axisNames[axis], Direction: dir,
							Diameter: h.Diameter, Depth: tT, Through: true, Countersink: true},
						Hole{Part: into.ID, Kind: Pilot, At: face, Axis: axisNames[axis], Direction: dir,
							Diameter: PilotHole(h.Diameter), Depth: math.Max(length-tT, 0)})
				}
			case Dowel:
				dt, di := dowelDepths(h.Length, bt, bi, axis)
				f.Fasteners = append(f.Fasteners, Fastener{Start: face.with(axis, plane-d*dt), Tip: face.with(axis, plane+d*di)})
				if h.Diameter > 0 {
					f.Holes = append(f.Holes,
						Hole{Part: through.ID, Kind: DowelHole, At: face, Axis: axisNames[axis], Direction: -dir, Diameter: h.Diameter, Depth: dt},
						Hole{Part: into.ID, Kind: DowelHole, At: face, Axis: axisNames[axis], Direction: dir, Diameter: h.Diameter, Depth: di})
				}
			default:
				// Pocket screws and cam locks: positions only. Their jigs and
				// fittings set the holes.
				f.Fasteners = append(f.Fasteners, Fastener{Start: entry, Tip: face})
			}
		}
		out = append(out, f)
	}
	return out
}

// dowelDepths splits a dowel between two boards, plus a millimetre each for
// glue. A hole in a board's face goes no deeper than MaxFaceHoleDepth; the
// rest of the dowel goes into the other board's edge.
func dowelDepths(length float64, a, b Box, axis int) (float64, float64) {
	if length <= 0 {
		return 0, 0
	}
	half := length/2 + 1
	aFace, bFace := a.thicknessAxis() == axis, b.thicknessAxis() == axis
	switch {
	case aFace && !bFace:
		da := math.Min(half, MaxFaceHoleDepth(a.extent(axis)))
		return da, length - da + 2
	case bFace && !aFace:
		db := math.Min(half, MaxFaceHoleDepth(b.extent(axis)))
		return length - db + 2, db
	}
	return half, half
}

func pieceBox(s Spec) Box {
	var u Box
	for i, p := range s.Parts {
		b := p.Box()
		if i == 0 {
			u = b
			continue
		}
		u.Min = Vec3{math.Min(u.Min.X, b.Min.X), math.Min(u.Min.Y, b.Min.Y), math.Min(u.Min.Z, b.Min.Z)}
		u.Max = Vec3{math.Max(u.Max.X, b.Max.X), math.Max(u.Max.Y, b.Max.Y), math.Max(u.Max.Z, b.Max.Z)}
	}
	return u
}
