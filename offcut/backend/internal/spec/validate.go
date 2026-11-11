package spec

import (
	"fmt"
	"math"
	"slices"
	"strings"
)

// Tolerance is how far apart two numbers may be, in millimetres, and still
// count as equal. Below it, a gap or an overlap is rounding, not a mistake.
const Tolerance = 0.5

type Severity string //@name Severity

const (
	Error   Severity = "error"   // the piece cannot be built as specified
	Warning Severity = "warning" // buildable, but worth a look
)

// Issue is one problem with a spec. Messages are written for two readers: the
// model, which gets them back to repair the spec, and the user. So they are
// exact and name the parts in question.
type Issue struct {
	Severity Severity `json:"severity"`
	Code     string   `json:"code"`
	Path     string   `json:"path"`
	Message  string   `json:"message"`
	Parts    []string `json:"parts,omitempty"`
} //@name Issue

type Options struct {
	// StockThicknesses are the board thicknesses the user can buy. A part whose
	// thickness is not among them gets a warning.
	StockThicknesses []float64
}

var DefaultStockThicknesses = []float64{6, 9, 12, 15, 18, 25}

func HasErrors(issues []Issue) bool {
	return slices.ContainsFunc(issues, func(i Issue) bool { return i.Severity == Error })
}

// Validate checks that a spec describes a piece that can be built: the parts
// add up to the overall size, nothing occupies the same space, every joint
// joins parts that touch, everything is connected, and every part is added in
// exactly one step.
func Validate(s Spec, opt Options) []Issue {
	v := validator{s: s, opt: opt, parts: map[string]Part{}}
	if len(v.opt.StockThicknesses) == 0 {
		v.opt.StockThicknesses = DefaultStockThicknesses
	}
	v.overall()
	v.partsWellFormed()
	if len(v.parts) > 0 {
		v.bounds()
		v.overlaps()
		v.thickness()
	}
	hw := v.hardware()
	v.joints(hw)
	v.connected()
	v.steps(hw)
	return v.issues
}

type validator struct {
	s      Spec
	opt    Options
	parts  map[string]Part
	issues []Issue
}

func (v *validator) add(sev Severity, code, path, msg string, parts ...string) {
	v.issues = append(v.issues, Issue{Severity: sev, Code: code, Path: path, Message: msg, Parts: parts})
}

func (v *validator) overall() {
	o := v.s.Overall
	for _, d := range []struct {
		name string
		dim  Dimension
	}{{"width", o.Width}, {"height", o.Height}, {"depth", o.Depth}} {
		if d.dim.Value <= 0 {
			v.add(Error, "overall_size", "overall."+d.name, fmt.Sprintf("Overall %s must be greater than 0.", d.name))
		}
	}
}

func (v *validator) partsWellFormed() {
	if len(v.s.Parts) == 0 {
		v.add(Error, "no_parts", "parts", "The spec has no parts.")
		return
	}
	for i, p := range v.s.Parts {
		path := fmt.Sprintf("parts[%d]", i)
		if strings.TrimSpace(p.ID) == "" {
			v.add(Error, "part_id", path+".id", fmt.Sprintf("Part %d (%q) has no id.", i, p.Name))
			continue
		}
		if _, dup := v.parts[p.ID]; dup {
			v.add(Error, "duplicate_part", path+".id", fmt.Sprintf("Part id %q is used more than once. Ids must be unique.", p.ID), p.ID)
			continue
		}
		if p.Size.X < 1 || p.Size.Y < 1 || p.Size.Z < 1 {
			v.add(Error, "part_size", path+".size",
				fmt.Sprintf("Part %q has size %s; every extent must be at least 1 mm.", p.ID, fmtVec(p.Size)), p.ID)
			continue
		}
		v.parts[p.ID] = p
	}
}

// bounds checks that the parts, together, fill exactly the overall size,
// starting at the origin.
func (v *validator) bounds() {
	u := v.union()
	o := v.s.Overall
	if math.Abs(u.Min.X) > Tolerance || math.Abs(u.Min.Y) > Tolerance || math.Abs(u.Min.Z) > Tolerance {
		v.add(Error, "origin", "parts",
			fmt.Sprintf("The parts start at %s; the front-left-bottom corner of the piece must be at 0,0,0.", fmtVec(u.Min)))
	}
	for _, c := range []struct {
		name, axis string
		got, want  float64
	}{
		{"width", "x", u.Max.X - u.Min.X, o.Width.Value},
		{"height", "y", u.Max.Y - u.Min.Y, o.Height.Value},
		{"depth", "z", u.Max.Z - u.Min.Z, o.Depth.Value},
	} {
		if math.Abs(c.got-c.want) > Tolerance {
			v.add(Error, "overall_mismatch", "overall."+c.name,
				fmt.Sprintf("The parts span %s mm in %s (%s), but the overall %s is %s mm.",
					fmtMM(c.got), c.name, c.axis, c.name, fmtMM(c.want)))
		}
	}
}

func (v *validator) union() Box {
	first := true
	var u Box
	for _, p := range v.s.Parts {
		if _, ok := v.parts[p.ID]; !ok {
			continue
		}
		b := p.Box()
		if first {
			u, first = b, false
			continue
		}
		u.Min = Vec3{math.Min(u.Min.X, b.Min.X), math.Min(u.Min.Y, b.Min.Y), math.Min(u.Min.Z, b.Min.Z)}
		u.Max = Vec3{math.Max(u.Max.X, b.Max.X), math.Max(u.Max.Y, b.Max.Y), math.Max(u.Max.Z, b.Max.Z)}
	}
	return u
}

// overlaps reports pairs of parts that occupy the same space. This is the
// classic mistake: a shelf as wide as the case, forgetting the two sides.
func (v *validator) overlaps() {
	ps := v.validParts()
	for i := range ps {
		for j := i + 1; j < len(ps); j++ {
			a, b := ps[i], ps[j]
			depth, ok := penetration(a.Box(), b.Box())
			if !ok {
				continue
			}
			v.add(Error, "overlap", "parts",
				fmt.Sprintf("%q and %q occupy the same space (they overlap by %s mm in x, %s mm in y and %s mm in z). Shorten one of them, usually by the other's thickness.",
					a.ID, b.ID, fmtMM(depth.X), fmtMM(depth.Y), fmtMM(depth.Z)), a.ID, b.ID)
		}
	}
}

// penetration returns how far two boxes overlap on each axis, and whether
// they overlap by more than the tolerance on all three.
func penetration(a, b Box) (Vec3, bool) {
	var d [3]float64
	for i := 0; i < 3; i++ {
		alo, ahi := a.axis(i)
		blo, bhi := b.axis(i)
		d[i] = math.Min(ahi, bhi) - math.Max(alo, blo)
		if d[i] <= Tolerance {
			return Vec3{}, false
		}
	}
	return Vec3{d[0], d[1], d[2]}, true
}

// MaxRunnerGap is the widest gap a drawer runner can bridge.
const MaxRunnerGap = 20.0

// facing reports whether two boxes face each other across a gap of at most
// maxGap on one axis, with real overlap on the other two.
func facing(a, b Box, maxGap float64) bool {
	gaps := 0
	for i := 0; i < 3; i++ {
		alo, ahi := a.axis(i)
		blo, bhi := b.axis(i)
		overlap := math.Min(ahi, bhi) - math.Max(alo, blo)
		switch {
		case overlap > Tolerance:
		case overlap >= -maxGap-Tolerance:
			gaps++
		default:
			return false
		}
	}
	return gaps == 1
}

// touching reports whether two boxes share a face: they meet on one axis and
// overlap with real area on the other two.
func touching(a, b Box) bool {
	meet := 0
	for i := 0; i < 3; i++ {
		alo, ahi := a.axis(i)
		blo, bhi := b.axis(i)
		overlap := math.Min(ahi, bhi) - math.Max(alo, blo)
		switch {
		case overlap > Tolerance:
			// overlapping with area on this axis
		case math.Abs(overlap) <= Tolerance:
			meet++
		default:
			return false // a gap
		}
	}
	return meet == 1
}

func (v *validator) thickness() {
	for _, p := range v.validParts() {
		_, _, t := p.Board()
		if slices.ContainsFunc(v.opt.StockThicknesses, func(s float64) bool { return math.Abs(s-t) <= Tolerance }) {
			continue
		}
		v.add(Warning, "stock_thickness", "parts."+p.ID,
			fmt.Sprintf("%q is %s mm thick, which is not a stock thickness (%s). Check it, or plan to buy or plane a board to this size.",
				p.ID, fmtMM(t), joinMM(v.opt.StockThicknesses)), p.ID)
	}
}

func (v *validator) hardware() map[string]Hardware {
	hw := map[string]Hardware{}
	for i, h := range v.s.Hardware {
		path := fmt.Sprintf("hardware[%d]", i)
		switch {
		case strings.TrimSpace(h.ID) == "":
			v.add(Error, "hardware_id", path+".id", fmt.Sprintf("Hardware %q has no id.", h.Name))
		case hw[h.ID].ID != "":
			v.add(Error, "duplicate_hardware", path+".id", fmt.Sprintf("Hardware id %q is used more than once.", h.ID))
		case h.Quantity < 1:
			v.add(Error, "hardware_quantity", path+".quantity", fmt.Sprintf("Hardware %q needs a quantity of at least 1.", h.ID))
		default:
			hw[h.ID] = h
		}
	}
	return hw
}

func (v *validator) joints(hw map[string]Hardware) {
	used := map[string]int{}
	for i, j := range v.s.Joints {
		path := fmt.Sprintf("joints[%d]", i)
		a, okA := v.parts[j.A]
		b, okB := v.parts[j.B]
		if !okA || !okB {
			for _, id := range []string{j.A, j.B} {
				if _, ok := v.parts[id]; !ok {
					v.add(Error, "joint_unknown_part", path, fmt.Sprintf("Joint %d refers to part %q, which does not exist.", i, id))
				}
			}
			continue
		}
		if j.A == j.B {
			v.add(Error, "joint_self", path, fmt.Sprintf("Joint %d joins %q to itself.", i, j.A), j.A)
			continue
		}
		if !slices.Contains(JointMethods, j.Method) {
			v.add(Error, "joint_method", path+".method",
				fmt.Sprintf("Joint %d uses method %q; use one of %s.", i, j.Method, joinMethods()), j.A, j.B)
		}
		if j.Method == Runner {
			if !facing(a.Box(), b.Box(), MaxRunnerGap) {
				v.add(Error, "runner_gap", path,
					fmt.Sprintf("Runner joint %d needs %q and %q to face each other across a gap of up to %s mm (side-mounted runners need about 12.5 mm). They don't.", i, j.A, j.B, fmtMM(MaxRunnerGap)), j.A, j.B)
			}
		} else if !touching(a.Box(), b.Box()) {
			v.add(Error, "joint_not_touching", path,
				fmt.Sprintf("Joint %d joins %q and %q, but they do not share a face, so they cannot be joined. Move one part, or join different parts.", i, j.A, j.B), j.A, j.B)
		}
		if j.Hardware != "" {
			if _, ok := hw[j.Hardware]; !ok {
				v.add(Error, "joint_unknown_hardware", path+".hardware",
					fmt.Sprintf("Joint %d uses hardware %q, which is not in the hardware list.", i, j.Hardware), j.A, j.B)
			} else {
				used[j.Hardware] += max(j.Count, 1)
			}
		}
	}
	for id, n := range used {
		if n > hw[id].Quantity {
			v.add(Error, "hardware_short", "hardware."+id,
				fmt.Sprintf("The joints use %d of %q, but the hardware list has only %d.", n, id, hw[id].Quantity))
		}
	}
}

// connected checks that every part is joined, through some chain of joints,
// to every other. A part held by nothing falls off.
func (v *validator) connected() {
	ps := v.validParts()
	if len(ps) < 2 {
		return
	}
	adj := map[string][]string{}
	for _, j := range v.s.Joints {
		if _, ok := v.parts[j.A]; !ok {
			continue
		}
		if _, ok := v.parts[j.B]; !ok {
			continue
		}
		adj[j.A] = append(adj[j.A], j.B)
		adj[j.B] = append(adj[j.B], j.A)
	}
	seen := map[string]bool{ps[0].ID: true}
	queue := []string{ps[0].ID}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, n := range adj[id] {
			if !seen[n] {
				seen[n] = true
				queue = append(queue, n)
			}
		}
	}
	var loose []string
	for _, p := range ps {
		if !seen[p.ID] {
			loose = append(loose, p.ID)
		}
	}
	if len(loose) > 0 {
		v.add(Error, "not_connected", "joints",
			fmt.Sprintf("These parts are not joined to the rest of the piece: %s. Add joints for them.", quoteAll(loose)), loose...)
	}
}

func (v *validator) steps(hw map[string]Hardware) {
	if len(v.s.Steps) == 0 {
		v.add(Error, "no_steps", "steps", "The spec has no assembly steps.")
		return
	}
	addedIn := map[string]int{}
	for i, st := range v.s.Steps {
		path := fmt.Sprintf("steps[%d]", i)
		if len(st.Parts) == 0 && len(st.Hardware) == 0 {
			v.add(Warning, "empty_step", path, fmt.Sprintf("Step %d adds no parts or hardware.", i+1))
		}
		for _, id := range st.Parts {
			if _, ok := v.parts[id]; !ok {
				v.add(Error, "step_unknown_part", path+".parts", fmt.Sprintf("Step %d adds part %q, which does not exist.", i+1, id))
				continue
			}
			if prev, dup := addedIn[id]; dup {
				v.add(Error, "step_part_twice", path+".parts",
					fmt.Sprintf("Part %q is added in step %d and again in step %d. Add each part once.", id, prev+1, i+1), id)
				continue
			}
			addedIn[id] = i
		}
		for _, h := range st.Hardware {
			if _, ok := hw[h.ID]; !ok {
				v.add(Error, "step_unknown_hardware", path+".hardware", fmt.Sprintf("Step %d uses hardware %q, which is not in the hardware list.", i+1, h.ID))
			}
		}
	}
	var missing []string
	for _, p := range v.validParts() {
		if _, ok := addedIn[p.ID]; !ok {
			missing = append(missing, p.ID)
		}
	}
	if len(missing) > 0 {
		v.add(Error, "step_missing_part", "steps",
			fmt.Sprintf("These parts are never added in any step: %s.", quoteAll(missing)), missing...)
	}
}

// validParts returns the well-formed parts in spec order.
func (v *validator) validParts() []Part {
	out := make([]Part, 0, len(v.parts))
	for _, p := range v.s.Parts {
		if q, ok := v.parts[p.ID]; ok && q.Name == p.Name && q.Position == p.Position && q.Size == p.Size {
			out = append(out, p)
		}
	}
	return out
}

func joinMethods() string {
	s := make([]string, len(JointMethods))
	for i, m := range JointMethods {
		s[i] = string(m)
	}
	return strings.Join(s, ", ")
}

func fmtMM(f float64) string {
	if math.Abs(f-math.Round(f)) < 0.05 {
		return fmt.Sprintf("%.0f", f)
	}
	return fmt.Sprintf("%.1f", f)
}

func fmtVec(v Vec3) string { return fmtMM(v.X) + "," + fmtMM(v.Y) + "," + fmtMM(v.Z) }

func joinMM(fs []float64) string {
	s := make([]string, len(fs))
	for i, f := range fs {
		s[i] = fmtMM(f)
	}
	return strings.Join(s, ", ")
}

func quoteAll(ids []string) string {
	q := make([]string, len(ids))
	for i, id := range ids {
		q[i] = fmt.Sprintf("%q", id)
	}
	return strings.Join(q, ", ")
}
