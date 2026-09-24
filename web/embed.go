package web

import (
	"embed"
	"html/template"
	"io/fs"
	"net/http"
)

//go:embed static/* templates/*
var embeddedFiles embed.FS

func StaticFS() (http.FileSystem, error) {
	sub, err := fs.Sub(embeddedFiles, "static")
	if err != nil {
		return nil, err
	}
	return http.FS(sub), nil
}

func ParseTemplates() (*template.Template, error) {
	return template.ParseFS(embeddedFiles, "templates/*.html")
}
