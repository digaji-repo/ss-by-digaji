package security

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestGenerateAndValidateRoomCode(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 300; i++ {
		code, err := GenerateRoomCode()
		if err != nil {
			t.Fatalf("GenerateRoomCode failed: %v", err)
		}
		if len(code) != 3 {
			t.Fatalf("expected length 3, got %q", code)
		}
		if _, err := ValidateRoomCode(code); err != nil {
			t.Fatalf("generated code %q failed validation: %v", code, err)
		}
		seen[code] = struct{}{}
	}
	if len(seen) < 250 {
		t.Fatalf("expected high entropy in generated codes, got %d unique out of 300", len(seen))
	}

	if norm, err := ValidateRoomCode(" q9a "); err != nil || norm != "Q9A" {
		t.Fatalf("expected normalized Q9A, got %q err=%v", norm, err)
	}
	for _, bad := range []string{"", "AB", "ABCD", "A-1", "A 1", "ab$"} {
		if _, err := ValidateRoomCode(bad); err == nil {
			t.Fatalf("expected invalid room code error for %q", bad)
		}
	}
}

func TestPasswordAndTokenLifecycle(t *testing.T) {
	hash, err := HashPassword("secret-room-pw")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if !VerifyPassword(hash, "secret-room-pw") {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword(hash, "wrong-pw") {
		t.Fatal("expected wrong password to fail verification")
	}

	secret := "test-hmac-secret-32-chars-minimum"
	roomID := "550e8400-e29b-41d4-a716-446655440000"
	token := IssueRoomToken(secret, roomID, time.Now().UTC().Add(10*time.Minute))

	if !VerifyRoomToken(secret, token, roomID) {
		t.Fatal("expected valid token to pass")
	}
	if VerifyRoomToken(secret, token, "different-room") {
		t.Fatal("expected mismatched roomID to fail")
	}
	if VerifyRoomToken(secret, token+"tampered", roomID) {
		t.Fatal("expected tampered token to fail")
	}

	expiredToken := IssueRoomToken(secret, roomID, time.Now().UTC().Add(-time.Minute))
	if VerifyRoomToken(secret, expiredToken, roomID) {
		t.Fatal("expected expired token to fail")
	}
}

func TestSanitizeAndValidateFile(t *testing.T) {
	cleaned, err := SanitizeFilename(`../../evil\..\hello world.txt`)
	if err != nil {
		t.Fatalf("SanitizeFilename failed: %v", err)
	}
	if strings.Contains(cleaned, "..") || strings.Contains(cleaned, "/") || strings.Contains(cleaned, `\`) {
		t.Fatalf("unexpected traversal in sanitized filename: %q", cleaned)
	}
	if cleaned != "hello world.txt" {
		t.Fatalf("expected hello world.txt, got %q", cleaned)
	}

	if _, err := SanitizeFilename("../.."); err == nil {
		t.Fatal("expected traversal-only filename to fail")
	}

	for _, disallowed := range []string{"malware.exe", "script.ps1", "macro.docm", "payload.bin", "unknown.xyz123"} {
		if _, err := ValidateExtensionAndDetectMIME(disallowed, []byte("plain"), ""); !errors.Is(err, ErrBlockedExtension) {
			t.Fatalf("expected ErrBlockedExtension for %q, got %v", disallowed, err)
		}
	}

	if _, err := ValidateExtensionAndDetectMIME("disguised.txt", []byte{'M', 'Z', 0x90, 0x00}, "text/plain"); err == nil {
		t.Fatal("expected MZ PE header disguised as .txt to be blocked")
	}
	if _, err := ValidateExtensionAndDetectMIME("fake.pdf", []byte("<html>alert(1)</html>"), "application/pdf"); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("expected ErrInvalidSignature for fake.pdf, got %v", err)
	}
	if _, err := ValidateExtensionAndDetectMIME("fake.png", []byte("not-a-png"), "image/png"); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("expected ErrInvalidSignature for fake.png, got %v", err)
	}

	mimeType, err := ValidateExtensionAndDetectMIME("notes.json", []byte(`{"ok":true}`), "application/json")
	if err != nil || mimeType != "application/json" {
		t.Fatalf("expected application/json, got %q err=%v", mimeType, err)
	}

	docxMime, err := ValidateExtensionAndDetectMIME("report.docx", []byte{'P', 'K', 0x03, 0x04}, "application/octet-stream")
	if err != nil || docxMime != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" {
		t.Fatalf("expected docx mime, got %q err=%v", docxMime, err)
	}
	if !IsWordDocumentFile("report.docx", docxMime) {
		t.Fatal("expected IsWordDocumentFile to return true for .docx")
	}
	if IsPreviewableMIME("image/svg+xml") {
		t.Fatal("expected image/svg+xml to be disallowed from inline preview")
	}
}

func TestInspectOOXMLArchive(t *testing.T) {
	tmpDir := t.TempDir()
	validPath := filepath.Join(tmpDir, "valid.docx")
	var validBuf bytes.Buffer
	zw := zip.NewWriter(&validBuf)
	w, _ := zw.Create("[Content_Types].xml")
	_, _ = w.Write([]byte(`<Types></Types>`))
	_ = zw.Close()
	_ = os.WriteFile(validPath, validBuf.Bytes(), 0o600)

	if err := InspectOOXMLArchive(validPath, 1024*1024, true); err != nil {
		t.Fatalf("expected valid docx archive, got %v", err)
	}

	invalidPath := filepath.Join(tmpDir, "missing-types.docx")
	var badBuf bytes.Buffer
	zwBad := zip.NewWriter(&badBuf)
	w2, _ := zwBad.Create("random.txt")
	_, _ = w2.Write([]byte("not a docx"))
	_ = zwBad.Close()
	_ = os.WriteFile(invalidPath, badBuf.Bytes(), 0o600)

	if err := InspectOOXMLArchive(invalidPath, 1024*1024, true); !errors.Is(err, ErrInvalidArchive) {
		t.Fatalf("expected ErrInvalidArchive when missing [Content_Types].xml, got %v", err)
	}
}

func TestClamAVScannerINSTREAM(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "sample.txt")
	_ = os.WriteFile(tmpFile, []byte("hello world"), 0o600)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen failed: %v", err)
	}
	defer func() { _ = ln.Close() }()

	reply := "stream: OK\x00"
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer func() { _ = c.Close() }()
				buf := make([]byte, 4096)
				for {
					n, rErr := c.Read(buf)
					if n > 0 && bytes.Contains(buf[:n], []byte{0, 0, 0, 0}) {
						_, _ = c.Write([]byte(reply))
						return
					}
					if rErr != nil {
						return
					}
				}
			}(conn)
		}
	}()

	scanner := NewClamAVScanner(ln.Addr().String(), 2*time.Second)
	if err := scanner.ScanFile(context.Background(), tmpFile); err != nil {
		t.Fatalf("expected clean scan result, got %v", err)
	}

	reply = "stream: Eicar-Signature FOUND\x00"
	if err := scanner.ScanFile(context.Background(), tmpFile); !errors.Is(err, ErrMalwareDetected) {
		t.Fatalf("expected ErrMalwareDetected, got %v", err)
	}

	downScanner := NewClamAVScanner("127.0.0.1:1", 200*time.Millisecond)
	if err := downScanner.ScanFile(context.Background(), tmpFile); !errors.Is(err, ErrScannerUnavailable) {
		t.Fatalf("expected ErrScannerUnavailable when clamd is offline, got %v", err)
	}
}
