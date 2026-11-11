package analysis

import (
	"offcut/internal/llm"
	"offcut/internal/spec"
)

const (
	ToolRequestPhotos = "request_photos"
	ToolAskUser       = "ask_user"
	ToolSubmitSpec    = "submit_spec"
)

// Shot is a photo the model asks for.
type Shot struct {
	View   string `json:"view"`
	Reason string `json:"reason"`
} //@name Shot

// Question is something the model asks the user to measure or decide.
type Question struct {
	Question string `json:"question"`
	Reason   string `json:"reason"`
} //@name Question

type RequestPhotosInput struct {
	Shots []Shot `json:"shots"`
}

type AskUserInput struct {
	Questions []Question `json:"questions"`
}

func obj(props map[string]any, required ...string) map[string]any {
	return map[string]any{"type": "object", "properties": props, "required": required, "additionalProperties": false}
}

func str(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }

func num(desc string) map[string]any { return map[string]any{"type": "number", "description": desc} }

func arr(items map[string]any, desc string) map[string]any {
	return map[string]any{"type": "array", "items": items, "description": desc}
}

var confidence = map[string]any{"type": "string", "enum": []string{"measured", "derived", "assumed"}}

var vec3 = obj(map[string]any{"x": num(""), "y": num(""), "z": num("")}, "x", "y", "z")

var dimension = obj(map[string]any{"value": num("millimetres"), "confidence": confidence}, "value", "confidence")

var specSchema = obj(map[string]any{
	"name":      str("What the piece is, e.g. \"Bedside table\"."),
	"reference": str("Which measurement gave the photos their scale, e.g. \"Top width, 450 mm, measured by the user\"."),
	"overall": obj(map[string]any{
		"width": dimension, "height": dimension, "depth": dimension,
	}, "width", "height", "depth"),
	"parts": arr(obj(map[string]any{
		"id":         str("snake_case, unique"),
		"name":       str("Short name a person would use"),
		"material":   str("e.g. \"18 mm plywood\""),
		"position":   vec3,
		"size":       vec3,
		"confidence": obj(map[string]any{"x": confidence, "y": confidence, "z": confidence}, "x", "y", "z"),
		"notes":      str("Optional"),
	}, "id", "name", "material", "position", "size", "confidence"), "Every board in the piece."),
	"joints": arr(obj(map[string]any{
		"a":        str("Part id"),
		"b":        str("Part id"),
		"method":   map[string]any{"type": "string", "enum": spec.JointMethods},
		"count":    map[string]any{"type": "integer", "description": "How many screws, dowels or nails this joint uses"},
		"hardware": str("Hardware id this joint consumes, if any"),
		"notes":    str("Optional"),
	}, "a", "b", "method", "count"), ""),
	"hardware": arr(obj(map[string]any{
		"id":       str("snake_case, unique"),
		"name":     str("e.g. \"Wood screw, 4 × 40 mm\""),
		"quantity": map[string]any{"type": "integer"},
		"diameter": num("mm. Required for screws and dowels: the holes are worked out from it"),
		"length":   num("mm. Required for screws, nails and dowels"),
		"notes":    str("Optional"),
	}, "id", "name", "quantity"), "Everything to buy besides boards."),
	"steps": arr(obj(map[string]any{
		"title": str("Two or three words"),
		"text":  str("One or two short imperative sentences"),
		"parts": arr(map[string]any{"type": "string"}, "Part ids added in this step"),
		"hardware": arr(obj(map[string]any{
			"id": str("Hardware id"), "quantity": map[string]any{"type": "integer"},
		}, "id", "quantity"), "Hardware used in this step"),
	}, "title", "text", "parts", "hardware"), "Assembly, in order."),
	"assumptions":     arr(map[string]any{"type": "string"}, "Everything you designed or guessed rather than saw."),
	"simplifications": arr(map[string]any{"type": "string"}, "Curves, turnings or upholstery modelled as boards."),
}, "name", "reference", "overall", "parts", "joints", "hardware", "steps", "assumptions", "simplifications")

var Tools = []llm.Tool{
	{
		Name:        ToolRequestPhotos,
		Description: "Ask the user for more photos, when something that changes the parts list is not visible. Ask for every shot you need at once.",
		Schema: obj(map[string]any{
			"shots": arr(obj(map[string]any{
				"view":   str("The shot, e.g. \"Side, straight on\", \"The back\", \"Inside the drawer\""),
				"reason": str("What it will tell you, in one short sentence the user will read"),
			}, "view", "reason"), ""),
		}, "shots"),
	},
	{
		Name:        ToolAskUser,
		Description: "Ask the user to measure or decide something a photo can't answer, such as a board's thickness.",
		Schema: obj(map[string]any{
			"questions": arr(obj(map[string]any{
				"question": str("e.g. \"How thick is the top?\""),
				"reason":   str("Why it matters, in one short sentence"),
			}, "question", "reason"), ""),
		}, "questions"),
	},
	{
		Name:        ToolSubmitSpec,
		Description: "Submit the complete specification. The software validates it and returns exact errors to fix, or accepts it.",
		Schema:      specSchema,
	},
}
