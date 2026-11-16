package security

import (
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

	if _, err := ValidateExtensionAndDetectMIME("malware.exe", []byte("plain"), ""); err == nil {
		t.Fatal("expected .exe to be blocked")
	}
	if _, err := ValidateExtensionAndDetectMIME("script.ps1", []byte("Write-Host 1"), ""); err == nil {
		t.Fatal("expected .ps1 to be blocked")
	}
	if _, err := ValidateExtensionAndDetectMIME("disguised.txt", []byte{'M', 'Z', 0x90, 0x00}, "text/plain"); err == nil {
		t.Fatal("expected MZ PE header disguised as .txt to be blocked")
	}

	mimeType, err := ValidateExtensionAndDetectMIME("notes.json", []byte(`{"ok":true}`), "application/json")
	if err != nil {
		t.Fatalf("expected json to pass, got %v", err)
	}
	if mimeType != "application/json" {
		t.Fatalf("expected application/json, got %q", mimeType)
	}
}
