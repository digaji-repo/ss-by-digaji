package security

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"unicode"
)

var (
	ErrBlockedExtension = errors.New("file extension is not in allowed safe formats")
	ErrEmptyFilename    = errors.New("invalid filename")
	ErrInvalidSignature = errors.New("file header signature does not match declared file extension")
	ErrZipBombDetected  = errors.New("archive exceeds safe uncompressed size or compression ratio limits")
	ErrInvalidArchive   = errors.New("corrupted or invalid OOXML document archive")
)

var blockedExtensions = map[string]bool{
	".exe": true, ".bat": true, ".cmd": true, ".com": true, ".msi": true,
	".msp": true, ".ps1": true, ".psm1": true, ".vbs": true, ".vbe": true,
	".jse": true, ".wsf": true, ".wsh": true, ".scr": true, ".pif": true,
	".hta": true, ".cpl": true, ".dll": true, ".sys": true, ".drv": true,
	".reg": true, ".inf": true, ".lnk": true, ".bin": true, ".jar": true,
	".iso": true, ".img": true, ".docm": true, ".xlsm": true, ".pptm": true,
	".dotm": true, ".xltm": true, ".potm": true, ".app": true, ".apk": true,
}

// allowedExtensions implements defense-in-depth extension allowlisting across supported document, media, archive, and developer text files.
var allowedExtensions = map[string]bool{
	// Documents & Office (non-macro)
	".txt": true, ".md": true, ".markdown": true, ".log": true, ".csv": true,
	".pdf": true, ".docx": true, ".xlsx": true, ".pptx": true,
	".odt": true, ".ods": true, ".odp": true, ".rtf": true, ".doc": true,
	// Safe Raster Images (SVG intentionally omitted from inline preview allowlist due to script vectors)
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".bmp": true, ".ico": true,
	// Audio & Video
	".mp3": true, ".wav": true, ".ogg": true, ".flac": true, ".aac": true, ".m4a": true,
	".mp4": true, ".webm": true, ".mov": true, ".mkv": true,
	// Archives
	".zip": true, ".tar": true, ".gz": true, ".tgz": true, ".7z": true, ".rar": true,
	// Code & Configuration Files
	".json": true, ".jsonc": true, ".js": true, ".mjs": true, ".cjs": true, ".jsx": true,
	".ts": true, ".mts": true, ".cts": true, ".tsx": true,
	".go": true, ".py": true, ".pyw": true, ".html": true, ".htm": true,
	".css": true, ".scss": true, ".sass": true, ".less": true,
	".sql": true, ".sh": true, ".bash": true, ".zsh": true,
	".yaml": true, ".yml": true, ".xml": true, ".rs": true, ".java": true,
	".c": true, ".h": true, ".cpp": true, ".hpp": true, ".cc": true,
	".php": true, ".rb": true, ".vue": true, ".svelte": true, ".astro": true,
	".env": true, ".ini": true, ".conf": true, ".cfg": true, ".toml": true,
	".gitignore": true, ".dockerignore": true, ".editorconfig": true,
}

var allowedExtensionlessNames = map[string]bool{
	"README":     true,
	"LICENSE":    true,
	"CHANGELOG":  true,
	"MAKEFILE":   true,
	"DOCKERFILE": true,
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

// IsAllowedFilename checks extension allowlist and denies known dangerous executable or macro extensions.
func IsAllowedFilename(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		return allowedExtensionlessNames[strings.ToUpper(filepath.Base(filename))]
	}
	if blockedExtensions[ext] {
		return false
	}
	return allowedExtensions[ext]
}

// ValidateExtensionAndDetectMIME enforces extension allowlist, rejects executable binaries, verifies magic signatures, and returns normalized MIME type.
func ValidateExtensionAndDetectMIME(filename string, headerSample []byte, declaredContentType string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if blockedExtensions[ext] || !IsAllowedFilename(filename) {
		return "", ErrBlockedExtension
	}

	// Reject Windows PE, ELF, and Mach-O executables even if renamed to an allowed extension.
	if hasExecutableMagic(headerSample) {
		return "", ErrBlockedExtension
	}

	// Enforce binary file-header signatures when payload bytes are available.
	if len(headerSample) > 0 {
		if err := verifyBinarySignature(ext, headerSample); err != nil {
			return "", err
		}
	}

	if codeMime, ok := codeAndTextExtMIME[ext]; ok {
		return codeMime, nil
	}
	if ext == "" && allowedExtensionlessNames[strings.ToUpper(filepath.Base(filename))] {
		return "text/plain", nil
	}

	officeExtMIME := map[string]string{
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	}
	if officeMIME, ok := officeExtMIME[ext]; ok {
		return officeMIME, nil
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

func hasExecutableMagic(sample []byte) bool {
	if len(sample) >= 2 && sample[0] == 'M' && sample[1] == 'Z' {
		return true
	}
	if len(sample) >= 4 && sample[0] == 0x7f && sample[1] == 'E' && sample[2] == 'L' && sample[3] == 'F' {
		return true
	}
	// Mach-O 32/64/universal magic headers
	if len(sample) >= 4 {
		be := string(sample[:4])
		if be == "\xfe\xed\xfa\xce" || be == "\xfe\xed\xfa\xcf" || be == "\xce\xfa\xed\xfe" || be == "\xcf\xfa\xed\xfe" || be == "\xca\xfe\xba\xbe" {
			return true
		}
	}
	return false
}

func verifyBinarySignature(ext string, sample []byte) error {
	switch ext {
	case ".pdf":
		if !bytes.Contains(sample[:min(len(sample), 32)], []byte("%PDF-")) {
			return ErrInvalidSignature
		}
	case ".png":
		if !bytes.HasPrefix(sample, []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}) {
			return ErrInvalidSignature
		}
	case ".jpg", ".jpeg":
		if len(sample) < 3 || sample[0] != 0xff || sample[1] != 0xd8 || sample[2] != 0xff {
			return ErrInvalidSignature
		}
	case ".gif":
		if !bytes.HasPrefix(sample, []byte("GIF87a")) && !bytes.HasPrefix(sample, []byte("GIF89a")) {
			return ErrInvalidSignature
		}
	case ".webp":
		if len(sample) < 12 || !bytes.HasPrefix(sample, []byte("RIFF")) || !bytes.Equal(sample[8:12], []byte("WEBP")) {
			return ErrInvalidSignature
		}
	case ".docx", ".xlsx", ".pptx", ".zip", ".odt", ".ods", ".odp":
		if !bytes.HasPrefix(sample, []byte{'P', 'K', 0x03, 0x04}) && !bytes.HasPrefix(sample, []byte{'P', 'K', 0x05, 0x06}) {
			return ErrInvalidSignature
		}
	case ".gz", ".tgz":
		if len(sample) < 2 || sample[0] != 0x1f || sample[1] != 0x8b {
			return ErrInvalidSignature
		}
	case ".7z":
		if !bytes.HasPrefix(sample, []byte{0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c}) {
			return ErrInvalidSignature
		}
	}
	return nil
}

// InspectOOXMLArchive guards against OOXML Zip Bombs, excessive archive entries, and malformed DOCX structures.
func InspectOOXMLArchive(filePath string, maxUncompressedBytes int64, requireDocxContentTypes bool) error {
	if maxUncompressedBytes <= 0 {
		maxUncompressedBytes = 30 * 1024 * 1024
	}
	r, err := zip.OpenReader(filePath)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidArchive, err)
	}
	defer func() { _ = r.Close() }()

	if len(r.File) == 0 || len(r.File) > 2000 {
		return ErrZipBombDetected
	}

	var totalUncompressed uint64
	var totalCompressed uint64
	hasContentTypes := false

	for _, f := range r.File {
		if f.Name == "[Content_Types].xml" {
			hasContentTypes = true
		}
		if strings.Contains(f.Name, "..") {
			return ErrInvalidArchive
		}
		totalUncompressed += f.UncompressedSize64
		totalCompressed += f.CompressedSize64
		if totalUncompressed > uint64(maxUncompressedBytes) {
			return ErrZipBombDetected
		}
	}

	// Reject extreme compression ratios (e.g. >150x when uncompressed exceeds 512 KB).
	if totalUncompressed > 512*1024 && totalCompressed > 0 && totalUncompressed/totalCompressed > 150 {
		return ErrZipBombDetected
	}

	if requireDocxContentTypes && !hasContentTypes {
		return ErrInvalidArchive
	}
	return nil
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

// IsWordDocumentFile returns true for OOXML .docx Word documents supported by the inline Word editor/viewer.
func IsWordDocumentFile(filename, mimeType string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".docx" {
		return true
	}
	base, _, _ := mime.ParseMediaType(mimeType)
	return base == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}

// IsPreviewableMIME determines if a file MIME type is safe to stream inline in the preview modal (excludes SVG).
func IsPreviewableMIME(mimeType string) bool {
	base, _, _ := mime.ParseMediaType(mimeType)
	if base == "image/svg+xml" {
		return false
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
