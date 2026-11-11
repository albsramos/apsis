package spec

import (
	"slices"
	"testing"
)

func codes(issues []Issue, sev Severity) []string {
	var out []string
	for _, i := range issues {
		if i.Severity == sev {
			out = append(out, i.Code)
		}
	}
	return out
}

func TestExampleIsValid(t *testing.T) {
	issues := Validate(Example(), Options{})
	if len(issues) > 0 {
		for _, i := range issues {
			t.Errorf("%s %s: %s", i.Severity, i.Code, i.Message)
		}
	}
}

func part(s *Spec, id string) *Part {
	for i := range s.Parts {
		if s.Parts[i].ID == id {
			return &s.Parts[i]
		}
	}
	panic("no part " + id)
}

// Each case breaks the example in one of the ways a model typically gets a
// spec wrong, and names the error the validator must raise.
func TestCatchesMistakes(t *testing.T) {
	cases := []struct {
		name   string
		break_ func(s *Spec)
		want   string
	}{
		{"shelf as wide as the case", func(s *Spec) {
			p := part(s, "shelf")
			p.Position.X, p.Size.X = 0, 450
		}, "overlap"},
		{"top too narrow for the overall width", func(s *Spec) {
			part(s, "top").Size.X = 440
			part(s, "back").Size.X = 440
			part(s, "side_right").Position.X = 422
		}, "overall_mismatch"},
		{"piece not at the origin", func(s *Spec) {
			for i := range s.Parts {
				s.Parts[i].Position.X += 10
			}
		}, "origin"},
		{"joint between parts that don't touch", func(s *Spec) {
			s.Joints = append(s.Joints, Joint{A: "top", B: "bottom", Method: "screw", Count: 2})
		}, "joint_not_touching"},
		{"joint to a part that doesn't exist", func(s *Spec) {
			s.Joints[0].B = "leg"
		}, "joint_unknown_part"},
		{"unknown joint method", func(s *Spec) {
			s.Joints[0].Method = "magic"
		}, "joint_method"},
		{"a part nothing holds", func(s *Spec) {
			var kept []Joint
			for _, j := range s.Joints {
				if j.A != "back" {
					kept = append(kept, j)
				}
			}
			s.Joints = kept
		}, "not_connected"},
		{"part never added in a step", func(s *Spec) {
			s.Steps[1].Parts = nil
		}, "step_missing_part"},
		{"part added twice", func(s *Spec) {
			s.Steps[1].Parts = append(s.Steps[1].Parts, "bottom")
		}, "step_part_twice"},
		{"joints use more screws than listed", func(s *Spec) {
			s.Hardware[1].Quantity = 4
		}, "hardware_short"},
		{"runner across the whole case", func(s *Spec) {
			s.Joints = append(s.Joints, Joint{A: "drawer_side_left", B: "side_right", Method: "runner", Count: 1})
		}, "runner_gap"},
		{"duplicate part id", func(s *Spec) {
			part(s, "shelf").ID = "bottom"
		}, "duplicate_part"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := Example()
			c.break_(&s)
			got := codes(Validate(s, Options{}), Error)
			if !slices.Contains(got, c.want) {
				t.Fatalf("want error %q, got %v", c.want, got)
			}
		})
	}
}

func TestStockThicknessIsAWarning(t *testing.T) {
	s := Example()
	part(&s, "top").Size.Y = 20
	part(&s, "top").Position.Y = 530
	part(&s, "side_left").Size.Y = 530
	part(&s, "side_right").Size.Y = 530
	part(&s, "back").Size.Y = 530
	issues := Validate(s, Options{})
	if HasErrors(issues) {
		t.Fatalf("unexpected errors: %v", codes(issues, Error))
	}
	if !slices.Contains(codes(issues, Warning), "stock_thickness") {
		t.Fatalf("want a stock_thickness warning, got %v", issues)
	}
}

func TestBoardSortsExtents(t *testing.T) {
	l, w, th := Part{Size: Vec3{18, 532, 394}}.Board()
	if l != 532 || w != 394 || th != 18 {
		t.Fatalf("got %v %v %v", l, w, th)
	}
}
