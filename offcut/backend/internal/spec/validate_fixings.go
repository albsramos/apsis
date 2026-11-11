package spec

import (
	"fmt"
	"math"
)

// nailDiameter is assumed for nails given no diameter: an 18-gauge brad.
const nailDiameter = 1.2

// fixings checks that every screw, nail and dowel works in the wood it goes
// into: it is sized, it doesn't come out the other side, it holds, the edge it
// goes into is thick enough, it isn't so near an end that it splits the board,
// and no two fixings meet inside a board.
func (v *validator) fixings(hw map[string]Hardware) {
	unsized := map[string]bool{}
	for _, j := range v.s.Joints {
		h, ok := hw[j.Hardware]
		if !ok || unsized[h.ID] {
			continue
		}
		missing := ""
		switch j.Method {
		case Screw, Dowel:
			if h.Diameter <= 0 || h.Length <= 0 {
				missing = `"diameter" and "length"`
			}
		case BradNail:
			if h.Length <= 0 {
				missing = `"length"`
			}
		}
		if missing != "" {
			unsized[h.ID] = true
			v.add(Error, "hardware_size", "hardware."+h.ID,
				fmt.Sprintf("Hardware %q is used for %s joints; give its %s in mm, so the holes can be worked out.", h.ID, j.Method, missing))
		}
	}

	parts := v.parts
	fixings := Fixings(v.s)
	type segment struct {
		joint int
		a, b  Vec3
		d     float64
	}
	var segments []segment
	for _, f := range fixings {
		h := hw[f.Hardware]
		_, okT := parts[f.Through]
		_, okI := parts[f.Into]
		if unsized[h.ID] || !okT || !okI {
			continue
		}
		bt, bi := parts[f.Through].Box(), parts[f.Into].Box()
		axis := axisIndex(f.Axis)
		tT, deep := bt.extent(axis), bi.extent(axis)
		d := h.Diameter
		if f.Method == BradNail && d <= 0 {
			d = nailDiameter
		}
		kind := map[JointMethod]string{Screw: "screws", BradNail: "nails", Dowel: "dowels"}[f.Method]
		path := fmt.Sprintf("joints[%d]", f.Joint)

		switch f.Method {
		case Screw, BradNail:
			if h.Length <= 0 {
				break
			}
			in := h.Length - tT
			if in > deep-breakOutMargin {
				v.add(Error, "fixing_breaks_out", path,
					fmt.Sprintf("The %s mm %s in joint %d go %s mm into %q, which is only %s mm deep there, so they would come out the other side. Use %s no longer than %s mm.",
						fmtMM(h.Length), kind, f.Joint, fmtMM(in), f.Into, fmtMM(deep), kind, fmtMM(math.Floor(tT+deep-breakOutMargin))), f.Through, f.Into)
			} else if h.Length < 2*tT {
				v.add(Warning, "fixing_short", path,
					fmt.Sprintf("The %s mm %s in joint %d go through %s mm of %q and only %s mm into %q. Use %s at least %s mm long, so they hold.",
						fmtMM(h.Length), kind, f.Joint, fmtMM(tT), f.Through, fmtMM(in), f.Into, kind, fmtMM(math.Ceil(2*tT))), f.Through, f.Into)
			}
		case Dowel:
			for _, hole := range f.Holes {
				b := parts[hole.Part].Box()
				if room := b.extent(axis) - breakOutMargin; hole.Depth > room {
					v.add(Error, "fixing_too_deep", path,
						fmt.Sprintf("The %s mm dowels in joint %d need %s mm deep holes in %q, which is only %s mm thick there. Use dowels no longer than %s mm.",
							fmtMM(h.Length), f.Joint, fmtMM(hole.Depth), hole.Part, fmtMM(b.extent(axis)), fmtMM(maxDowel(bt, bi, axis))), f.Through, f.Into)
					break
				}
			}
		}

		// The edge a screw or dowel goes into must be thick enough to hold it.
		if f.Method == Screw || f.Method == Dowel {
			need := 2.5 * d
			if f.Method == Dowel {
				need = 2 * d
			}
			for _, p := range []Part{parts[f.Into], parts[f.Through]} {
				b := p.Box()
				if p.ID == f.Through && f.Method != Dowel {
					continue
				}
				if b.thicknessAxis() == axis {
					continue // into the face, not the edge
				}
				if t := b.extent(b.thicknessAxis()); t < need {
					v.add(Error, "fixing_edge_thin", path,
						fmt.Sprintf("Joint %d puts %s mm %s into the %s mm edge of %q; an edge needs to be at least %s mm thick for them. Use thinner %s, or join it another way.",
							f.Joint, fmtMM(d), kind, fmtMM(t), p.ID, fmtMM(need), kind), f.Through, f.Into)
				}
			}
			if f.EndDistance < need {
				v.add(Warning, "fixing_near_end", path,
					fmt.Sprintf("The %s in joint %d sit %s mm from the ends of the joint, close enough to split the wood. Use fewer of them.",
						kind, f.Joint, fmtMM(f.EndDistance)), f.Through, f.Into)
			}
		}

		for _, fs := range f.Fasteners {
			segments = append(segments, segment{f.Joint, fs.Start, fs.Tip, d})
		}
	}

	// No two fixings may meet inside a board.
	reported := map[[2]int]bool{}
	for i := range segments {
		for k := i + 1; k < len(segments); k++ {
			a, b := segments[i], segments[k]
			if a.joint == b.joint || reported[[2]int{a.joint, b.joint}] {
				continue
			}
			dist, near := segmentDistance(a.a, a.b, b.a, b.b)
			if dist < (a.d+b.d)/2+1 {
				reported[[2]int{a.joint, b.joint}] = true
				ja, jb := v.s.Joints[a.joint], v.s.Joints[b.joint]
				v.add(Error, "fixings_clash", "joints",
					fmt.Sprintf("The fixings of joint %d (%q to %q) and joint %d (%q to %q) meet inside the wood near %s. Change one joint's count so they are spaced differently, or join the parts another way.",
						a.joint, ja.A, ja.B, b.joint, jb.A, jb.B, fmtVec(near)), ja.A, ja.B, jb.A, jb.B)
			}
		}
	}
}

func axisIndex(name string) int {
	for i, n := range axisNames {
		if n == name {
			return i
		}
	}
	return 0
}

// maxDowel is the longest dowel that fits a joint between two boards.
func maxDowel(a, b Box, axis int) float64 {
	room := func(x Box) float64 {
		if x.thicknessAxis() == axis {
			return MaxFaceHoleDepth(x.extent(axis))
		}
		return x.extent(axis) - breakOutMargin
	}
	return math.Floor(room(a) + room(b) - 2)
}

// segmentDistance is the shortest distance between segments p1-q1 and p2-q2,
// and the point on the first segment where it occurs.
func segmentDistance(p1, q1, p2, q2 Vec3) (float64, Vec3) {
	sub := func(a, b Vec3) Vec3 { return Vec3{a.X - b.X, a.Y - b.Y, a.Z - b.Z} }
	dot := func(a, b Vec3) float64 { return a.X*b.X + a.Y*b.Y + a.Z*b.Z }
	lerp := func(a, b Vec3, t float64) Vec3 { return Vec3{a.X + (b.X-a.X)*t, a.Y + (b.Y-a.Y)*t, a.Z + (b.Z-a.Z)*t} }
	clamp := func(x float64) float64 { return math.Max(0, math.Min(1, x)) }
	d1, d2, r := sub(q1, p1), sub(q2, p2), sub(p1, p2)
	a, e, f := dot(d1, d1), dot(d2, d2), dot(d2, r)
	var s, t float64
	switch {
	case a <= 1e-9 && e <= 1e-9:
	case a <= 1e-9:
		t = clamp(f / e)
	default:
		c := dot(d1, r)
		if e <= 1e-9 {
			s = clamp(-c / a)
		} else {
			b := dot(d1, d2)
			if den := a*e - b*b; den > 1e-9 {
				s = clamp((b*f - c*e) / den)
			}
			t = (b*s + f) / e
			if t < 0 {
				t, s = 0, clamp(-c/a)
			} else if t > 1 {
				t, s = 1, clamp((b-c)/a)
			}
		}
	}
	c1, c2 := lerp(p1, q1, s), lerp(p2, q2, t)
	diff := sub(c1, c2)
	return math.Sqrt(dot(diff, diff)), c1
}
