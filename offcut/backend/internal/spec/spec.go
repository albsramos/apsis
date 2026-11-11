// Package spec is the furniture specification: the one structure the model
// produces, the validator checks and the frontend draws from. Everything is in
// millimetres, in one assembly coordinate system:
//
//	x: width, left to right as seen from the front
//	y: height, floor up
//	z: depth, front to back
//
// The origin is the front-left-bottom corner of the piece. Every part is an
// axis-aligned board: a box given by its minimum corner and its extents. Which
// extent is the thickness is not stated; it is the smallest one.
package spec

import "sort"

// Confidence says where a number came from, so the user knows what to check
// with a tape measure.
type Confidence string //@name Confidence

const (
	Measured Confidence = "measured" // from the user's reference measurement
	Derived  Confidence = "derived"  // proportion read from the photos
	Assumed  Confidence = "assumed"  // not visible; a sensible default
)

type Vec3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
} //@name Vec3

type Dimension struct {
	Value      float64    `json:"value"`
	Confidence Confidence `json:"confidence"`
} //@name Dimension

type Overall struct {
	Width  Dimension `json:"width"`
	Height Dimension `json:"height"`
	Depth  Dimension `json:"depth"`
} //@name Overall

type AxisConfidence struct {
	X Confidence `json:"x"`
	Y Confidence `json:"y"`
	Z Confidence `json:"z"`
} //@name AxisConfidence

type Part struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Material   string         `json:"material"`
	Position   Vec3           `json:"position"`
	Size       Vec3           `json:"size"`
	Confidence AxisConfidence `json:"confidence"`
	Notes      string         `json:"notes,omitempty"`
} //@name Part

// JointMethod is how two parts are fastened. The methods are chosen for a
// beginner with a drill and a saw; a runner joins a drawer to its case across
// the runner's gap.
type JointMethod string //@name JointMethod

const (
	Screw       JointMethod = "screw"
	PocketScrew JointMethod = "pocket_screw"
	Dowel       JointMethod = "dowel"
	Glue        JointMethod = "glue"
	Groove      JointMethod = "groove"
	CamLock     JointMethod = "cam_lock"
	BradNail    JointMethod = "brad_nail"
	Runner      JointMethod = "runner"
)

var JointMethods = []JointMethod{Screw, PocketScrew, Dowel, Glue, Groove, CamLock, BradNail, Runner}

type Joint struct {
	A        string      `json:"a"`
	B        string      `json:"b"`
	Method   JointMethod `json:"method"`
	Count    int         `json:"count"`
	Hardware string      `json:"hardware,omitempty"`
	Notes    string      `json:"notes,omitempty"`
} //@name Joint

type Hardware struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
	// Diameter and Length, in mm, for screws, nails and dowels: the holes are
	// worked out from them.
	Diameter float64 `json:"diameter,omitempty"`
	Length   float64 `json:"length,omitempty"`
	Notes    string  `json:"notes,omitempty"`
} //@name Hardware

type HardwareUse struct {
	ID       string `json:"id"`
	Quantity int    `json:"quantity"`
} //@name HardwareUse

type Step struct {
	Title    string        `json:"title"`
	Text     string        `json:"text"`
	Parts    []string      `json:"parts"`
	Hardware []HardwareUse `json:"hardware"`
} //@name Step

type Spec struct {
	Name            string     `json:"name"`
	Reference       string     `json:"reference"`
	Overall         Overall    `json:"overall"`
	Parts           []Part     `json:"parts"`
	Joints          []Joint    `json:"joints"`
	Hardware        []Hardware `json:"hardware"`
	Steps           []Step     `json:"steps"`
	Assumptions     []string   `json:"assumptions"`
	Simplifications []string   `json:"simplifications"`
} //@name Spec

// Box is a part's volume.
type Box struct{ Min, Max Vec3 }

func (p Part) Box() Box {
	return Box{
		Min: p.Position,
		Max: Vec3{p.Position.X + p.Size.X, p.Position.Y + p.Size.Y, p.Position.Z + p.Size.Z},
	}
}

// Board returns the board's length, width and thickness: its extents from
// largest to smallest.
func (p Part) Board() (length, width, thickness float64) {
	d := []float64{p.Size.X, p.Size.Y, p.Size.Z}
	sort.Sort(sort.Reverse(sort.Float64Slice(d)))
	return d[0], d[1], d[2]
}

func (b Box) axis(i int) (lo, hi float64) {
	switch i {
	case 0:
		return b.Min.X, b.Max.X
	case 1:
		return b.Min.Y, b.Max.Y
	default:
		return b.Min.Z, b.Max.Z
	}
}
