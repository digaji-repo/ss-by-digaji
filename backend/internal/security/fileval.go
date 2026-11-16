package security

import (
	"errors"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"unicode"
)

var (
	ErrBlockedExtension = errors.New("file extension is not allowed for security reasons")
	ErrEmptyFilename    = errors.New("invalid filename")
)

var blockedExtensions = map[string]bool{
	".exe": true, ".bat": true, ".cmd": true, ".com": true, ".msi": true,
	".msp": true, ".ps1": true, ".psm1": true, ".vbs": true, ".vbe": true,
	".jse": true, ".wsf": true, ".wsh": true, ".scr": true, ".pif": true,
	".hta": true, ".cpl": true, ".dll": true, ".sys": true, ".drv": true,
	".reg": true, ".inf": true, ".lnk": true,
}

// codeAndTextExtMIME overrides OS MIME registries (e.g. Windows mapping .ts to video/mp2t) for code & text files.
var codeAndTextExtMIME = map[string]string{
	".txt":          "text/plain",
	".log":          "text/plain",
	".env":          "text/plain",
	".gitignore":    "text/plain",
	".dockerignore": "text/plain",
	".editorconfig": "text/plain",
	".conf":         "text/plain",
	".cfg":          "text/plain",
	".ini":          "text/plain",
	".toml":         "text/plain",
	".md":           "text/markdown",
	".markdown":     "text/markdown",
	".csv":          "text/csv",
	".json":         "application/json",
	".jsonc":        "application/json",
	".js":           "text/javascript",
	".mjs":          "text/javascript",
	".cjs":          "text/javascript",
	".jsx":          "text/javascript",
	".ts":           "text/typescript",
	".mts":          "text/typescript",
	".cts":          "text/typescript",
	".tsx":          "text/typescript",
	".go":           "text/x-go",
	".py":           "text/x-python",
	".pyw":          "text/x-python",
	".html":         "text/html",
	".htm":          "text/html",
	".css":          "text/css",
	".scss":         "text/css",
	".sass":         "text/css",
	".less":         "text/css",
	".sql":          "text/x-sql",
	".sh":           "text/x-shellscript",
	".bash":         "text/x-shellscript",
	".zsh":          "text/x-shellscript",
	".yaml":         "text/yaml",
	".yml":          "text/yaml",
	".xml":          "application/xml",
	".rs":           "text/x-rust",
	".java":         "text/x-java",
	".c":            "text/x-c",
	".h":            "text/x-c",
	".cpp":          "text/x-c++",
	".hpp":          "text/x-c++",
	".cc":           "text/x-c++",
	".php":          "text/x-php",
	".rb":           "text/x-ruby",
	".vue":          "text/plain",
	".svelte":       "text/plain",
	".astro":        "text/plain",
}

// SanitizeFilename strips directory traversal paths and control characters while keeping readable names.
func SanitizeFilename(raw string) (string, error) {
	base := filepath.Base(strings.ReplaceAll(raw, "\\", "/"))
	base = strings.TrimSpace(base)
	if base == "" || base == "." || base == ".." {
		return "", ErrEmptyFilename
	}

	var b strings.Builder
	b.Grow(len(base))
	for _, r := range base {
		if unicode.IsControl(r) || r == '/' || r == '\\' || r == 0 {
			continue
		}
		b.WriteRune(r)
	}
	cleaned := strings.TrimSpace(b.String())
	if cleaned == "" || cleaned == "." || cleaned == ".." {
		return "", ErrEmptyFilename
	}
	if len(cleaned) > 200 {
		ext := filepath.Ext(cleaned)
		stem := strings.TrimSuffix(cleaned, ext)
		maxStem := 200 - len(ext)
		if maxStem < 1 {
			maxStem = 1
		}
		if len(stem) > maxStem {
			stem = stem[:maxStem]
		}
		cleaned = stem + ext
	}
	return cleaned, nil
}

// ValidateExtensionAndDetectMIME rejects blocked executable extensions and detects safe MIME type from header bytes.
func ValidateExtensionAndDetectMIME(filename string, headerSample []byte, declaredContentType string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if blockedExtensions[ext] {
		return "", ErrBlockedExtension
	}

	// Reject Windows PE / ELF executables disguised with another extension.
	if len(headerSample) >= 2 && headerSample[0] == 'M' && headerSample[1] == 'Z' {
		return "", ErrBlockedExtension
	}
	if len(headerSample) >= 4 && headerSample[0] == 0x7f && headerSample[1] == 'E' && headerSample[2] == 'L' && headerSample[3] == 'F' {
		return "", ErrBlockedExtension
	}

	if codeMime, ok := codeAndTextExtMIME[ext]; ok {
		return codeMime, nil
	}

	detected := http.DetectContentType(headerSample)
	if ext != "" {
		if extMime := mime.TypeByExtension(ext); extMime != "" {
			baseExtMime, _, _ := mime.ParseMediaType(extMime)
			if detected == "application/octet-stream" || strings.HasPrefix(detected, "text/plain") {
				detected = baseExtMime
			}
		}
	}

	if detected == "" && declaredContentType != "" {
		if parsed, _, err := mime.ParseMediaType(declaredContentType); err == nil {
			detected = parsed
		}
	}
	if detected == "" {
		detected = "application/octet-stream"
	}
	return detected, nil
}

// IsEditableTextFile returns true when a file is a plain text, markdown, config, or source code file.
func IsEditableTextFile(filename, mimeType string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	if _, ok := codeAndTextExtMIME[ext]; ok {
		return true
	}
	base, _, _ := mime.ParseMediaType(mimeType)
	if strings.HasPrefix(base, "text/") {
		return true
	}
	switch base {
	case "application/json", "application/xml", "application/javascript":
		return true
	}
	return false
}

// IsPreviewableMIME determines if a file MIME type is safe to stream inline in the preview modal.
func IsPreviewableMIME(mimeType string) bool {
	base, _, _ := mime.ParseMediaType(mimeType)
	if base == "image/svg+xml" {
		return true
	}
	if strings.HasPrefix(base, "image/") ||
		strings.HasPrefix(base, "text/") ||
		strings.HasPrefix(base, "audio/") ||
		strings.HasPrefix(base, "video/") {
		return true
	}
	switch base {
	case "application/pdf", "application/json", "application/xml", "application/javascript":
		return true
	}
	return false
}
