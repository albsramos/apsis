package spec

import (
	_ "embed"
	"encoding/json"
)

//go:embed examples/bedside_table.json
var bedsideTable []byte

// Example returns a complete, valid spec for a bedside table with a drawer.
// The demo provider submits it, and the tests check the validator accepts it.
func Example() Spec {
	var s Spec
	if err := json.Unmarshal(bedsideTable, &s); err != nil {
		panic(err)
	}
	return s
}
