// Package migrations holds the schema, applied in order at startup.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
