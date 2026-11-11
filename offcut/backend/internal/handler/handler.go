// Package handler is the HTTP layer: it decodes requests, calls the service
// and encodes responses. The swag annotations here generate the OpenAPI
// document the frontend's hooks are built from (make api).
package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"offcut/internal/analysis"
	"offcut/internal/domain"
	"offcut/internal/llm/anthropic"
	"offcut/internal/service"
	"offcut/internal/spec"
)

type Handler struct{ svc *service.Service }

func New(svc *service.Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/projects", h.listProjects)
	mux.HandleFunc("POST /api/projects", h.createProject)
	mux.HandleFunc("GET /api/projects/{id}", h.getProject)
	mux.HandleFunc("PATCH /api/projects/{id}", h.renameProject)
	mux.HandleFunc("DELETE /api/projects/{id}", h.deleteProject)
	mux.HandleFunc("POST /api/projects/{id}/photos", h.uploadPhoto)
	mux.HandleFunc("POST /api/projects/{id}/analyze", h.analyzeProject)
	mux.HandleFunc("PUT /api/projects/{id}/spec", h.updateSpec)
	mux.HandleFunc("GET /api/photos/{id}", h.getPhoto)
	mux.HandleFunc("DELETE /api/photos/{id}", h.deletePhoto)
	mux.HandleFunc("POST /api/spec/validate", h.validateSpec)
	mux.HandleFunc("GET /api/settings", h.getSettings)
	mux.HandleFunc("PUT /api/settings", h.updateSettings)
	mux.HandleFunc("POST /api/settings/test", h.testConnection)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		writeJSON(w, http.StatusNotFound, ErrorResponse{Error: "Not found."})
	case errors.Is(err, domain.ErrConflict):
		writeJSON(w, http.StatusConflict, ErrorResponse{Error: err.Error()})
	case service.IsInvalid(err):
		writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: err.Error()})
	default:
		slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		writeJSON(w, http.StatusInternalServerError, ErrorResponse{Error: "Something went wrong on the server."})
	}
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "The request body isn't valid JSON: " + err.Error()})
		return false
	}
	return true
}

// listProjects godoc
//
//	@Summary	List projects, most recently changed first
//	@ID			listProjects
//	@Tags		projects
//	@Produce	json
//	@Success	200	{array}	ProjectSummary
//	@Router		/projects [get]
func (h *Handler) listProjects(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.ListProjects(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	out := make([]ProjectSummary, len(list))
	for i, s := range list {
		out[i] = toSummary(s)
	}
	writeJSON(w, http.StatusOK, out)
}

// createProject godoc
//
//	@Summary	Create a project
//	@ID			createProject
//	@Tags		projects
//	@Accept		json
//	@Produce	json
//	@Param		body	body		CreateProjectRequest	true	"The project"
//	@Success	201		{object}	Project
//	@Router		/projects [post]
func (h *Handler) createProject(w http.ResponseWriter, r *http.Request) {
	var req CreateProjectRequest
	if !decode(w, r, &req) {
		return
	}
	p, err := h.svc.CreateProject(r.Context(), req.Name)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toProject(service.ProjectDetail{Project: p}))
}

// getProject godoc
//
//	@Summary	Get a project with its photos, latest spec and what the AI is waiting on
//	@ID			getProject
//	@Tags		projects
//	@Produce	json
//	@Param		id	path		string	true	"Project id"
//	@Success	200	{object}	Project
//	@Failure	404	{object}	ErrorResponse
//	@Router		/projects/{id} [get]
func (h *Handler) getProject(w http.ResponseWriter, r *http.Request) {
	d, err := h.svc.GetProject(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toProject(d))
}

// renameProject godoc
//
//	@Summary	Rename a project
//	@ID			renameProject
//	@Tags		projects
//	@Accept		json
//	@Produce	json
//	@Param		id		path		string					true	"Project id"
//	@Param		body	body		RenameProjectRequest	true	"The new name"
//	@Success	200		{object}	Project
//	@Failure	400		{object}	ErrorResponse
//	@Router		/projects/{id} [patch]
func (h *Handler) renameProject(w http.ResponseWriter, r *http.Request) {
	var req RenameProjectRequest
	if !decode(w, r, &req) {
		return
	}
	if _, err := h.svc.RenameProject(r.Context(), r.PathValue("id"), req.Name); err != nil {
		writeError(w, r, err)
		return
	}
	h.getProject(w, r)
}

// deleteProject godoc
//
//	@Summary	Delete a project, its photos and its specs
//	@ID			deleteProject
//	@Tags		projects
//	@Param		id	path	string	true	"Project id"
//	@Success	204
//	@Failure	404	{object}	ErrorResponse
//	@Router		/projects/{id} [delete]
func (h *Handler) deleteProject(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteProject(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// uploadPhoto godoc
//
//	@Summary	Add a photo to a project
//	@ID			uploadPhoto
//	@Tags		photos
//	@Accept		multipart/form-data
//	@Produce	json
//	@Param		id		path		string	true	"Project id"
//	@Param		file	formData	file	true	"The photo (JPEG, PNG, WebP or GIF)"
//	@Param		view	formData	string	false	"Which view it shows, e.g. Front"
//	@Success	201		{object}	Photo
//	@Failure	400		{object}	ErrorResponse
//	@Router		/projects/{id}/photos [post]
func (h *Handler) uploadPhoto(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, service.MaxPhotoBytes+1<<20)
	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "Send the photo as the multipart field \"file\"."})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, ErrorResponse{Error: "The photo couldn't be read; it may be too large."})
		return
	}
	ph, err := h.svc.AddPhoto(r.Context(), r.PathValue("id"), r.FormValue("view"), data)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, Photo{ID: ph.ID, View: ph.View, URL: "/api/photos/" + ph.ID, CreatedAt: ph.CreatedAt})
}

// getPhoto godoc
//
//	@Summary	Get a photo's image
//	@ID			getPhoto
//	@Tags		photos
//	@Produce	image/jpeg,image/png,image/webp,image/gif
//	@Param		id	path	string	true	"Photo id"
//	@Success	200	{file}	binary
//	@Failure	404	{object}	ErrorResponse
//	@Router		/photos/{id} [get]
func (h *Handler) getPhoto(w http.ResponseWriter, r *http.Request) {
	ph, data, err := h.svc.PhotoData(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", ph.MediaType)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	_, _ = w.Write(data)
}

// deletePhoto godoc
//
//	@Summary	Delete a photo the AI hasn't seen yet
//	@ID			deletePhoto
//	@Tags		photos
//	@Param		id	path	string	true	"Photo id"
//	@Success	204
//	@Failure	409	{object}	ErrorResponse
//	@Router		/photos/{id} [delete]
func (h *Handler) deletePhoto(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeletePhoto(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// analyzeProject godoc
//
//	@Summary		Start or continue the AI analysis
//	@Description	The first call needs photos and a reference measurement. When the AI is waiting (status needs_input), send answers and add photos first, or skip. Otherwise new photos or notes start a re-analysis. Returns at once; poll the project for its status.
//	@ID				analyzeProject
//	@Tags			analysis
//	@Accept			json
//	@Produce		json
//	@Param			id		path		string			true	"Project id"
//	@Param			body	body		AnalyzeRequest	true	"What the user adds"
//	@Success		202		{object}	Project
//	@Failure		400		{object}	ErrorResponse
//	@Failure		409		{object}	ErrorResponse
//	@Router			/projects/{id}/analyze [post]
func (h *Handler) analyzeProject(w http.ResponseWriter, r *http.Request) {
	var req AnalyzeRequest
	if !decode(w, r, &req) {
		return
	}
	in := service.AnalyzeInput{Notes: req.Notes, Answers: req.Answers, Skip: req.Skip}
	if req.Reference != nil {
		in.Reference = &analysis.Reference{Label: req.Reference.Label, MM: req.Reference.MM}
	}
	if _, err := h.svc.Analyze(r.Context(), r.PathValue("id"), in); err != nil {
		writeError(w, r, err)
		return
	}
	d, err := h.svc.GetProject(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusAccepted, toProject(d))
}

// updateSpec godoc
//
//	@Summary	Save an edited spec as a new version
//	@ID			updateSpec
//	@Tags		specs
//	@Accept		json
//	@Produce	json
//	@Param		id		path		string				true	"Project id"
//	@Param		body	body		UpdateSpecRequest	true	"The whole spec"
//	@Success	200		{object}	SpecVersion
//	@Router		/projects/{id}/spec [put]
func (h *Handler) updateSpec(w http.ResponseWriter, r *http.Request) {
	var req UpdateSpecRequest
	if !decode(w, r, &req) {
		return
	}
	v, err := h.svc.UpdateSpec(r.Context(), r.PathValue("id"), req.Spec)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toSpecVersion(v))
}

// validateSpec godoc
//
//	@Summary	Check a spec without saving it
//	@ID			validateSpec
//	@Tags		specs
//	@Accept		json
//	@Produce	json
//	@Param		body	body		UpdateSpecRequest	true	"The whole spec"
//	@Success	200		{object}	ValidateResponse
//	@Router		/spec/validate [post]
func (h *Handler) validateSpec(w http.ResponseWriter, r *http.Request) {
	var req UpdateSpecRequest
	if !decode(w, r, &req) {
		return
	}
	issues, err := h.svc.ValidateSpec(r.Context(), req.Spec)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, ValidateResponse{Issues: nonNil(issues), Fixings: nonNil(spec.Fixings(req.Spec))})
}

// getSettings godoc
//
//	@Summary	Get the AI provider settings. The API key itself is never returned.
//	@ID			getSettings
//	@Tags		settings
//	@Produce	json
//	@Success	200	{object}	Settings
//	@Router		/settings [get]
func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	s, err := h.svc.GetSettings(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toSettings(s, anthropic.DefaultModel))
}

// updateSettings godoc
//
//	@Summary	Change the AI provider settings
//	@ID			updateSettings
//	@Tags		settings
//	@Accept		json
//	@Produce	json
//	@Param		body	body		UpdateSettingsRequest	true	"The settings"
//	@Success	200		{object}	Settings
//	@Failure	400		{object}	ErrorResponse
//	@Router		/settings [put]
func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	var req UpdateSettingsRequest
	if !decode(w, r, &req) {
		return
	}
	s, err := h.svc.UpdateSettings(r.Context(), service.SettingsInput{
		Provider: req.Provider, Model: req.Model, BaseURL: req.BaseURL, APIKey: req.APIKey, StockThicknesses: req.StockThicknesses,
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toSettings(s, anthropic.DefaultModel))
}

// testConnection godoc
//
//	@Summary	Check the saved provider settings with one small request
//	@ID			testConnection
//	@Tags		settings
//	@Produce	json
//	@Success	200	{object}	TestResult
//	@Router		/settings/test [post]
func (h *Handler) testConnection(w http.ResponseWriter, r *http.Request) {
	res := h.svc.TestConnection(r.Context())
	writeJSON(w, http.StatusOK, TestResult{OK: res.OK, Message: res.Message, LatencyMS: res.LatencyMS})
}
