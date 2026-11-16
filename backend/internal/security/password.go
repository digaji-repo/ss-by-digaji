package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidToken = errors.New("invalid or expired room token")

// HashPassword hashes a plaintext optional room password using bcrypt.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPassword compares a plaintext password with a bcrypt hash.
func VerifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// IssueRoomToken creates an HMAC-SHA256 signed access token bound to roomID and expiresAt.
func IssueRoomToken(secret, roomID string, expiresAt time.Time) string {
	payload := fmt.Sprintf("%s|%d", roomID, expiresAt.UTC().Unix())
	encodedPayload := base64.RawURLEncoding.EncodeToString([]byte(payload))
	sig := signPayload(secret, encodedPayload)
	return encodedPayload + "." + sig
}

// VerifyRoomToken verifies the signature, roomID match, and expiration timestamp.
func VerifyRoomToken(secret, token, expectedRoomID string) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return false
	}
	expectedSig := signPayload(secret, parts[0])
	if !hmac.Equal([]byte(parts[1]), []byte(expectedSig)) {
		return false
	}
	rawPayload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	fields := strings.Split(string(rawPayload), "|")
	if len(fields) != 2 {
		return false
	}
	if fields[0] != expectedRoomID {
		return false
	}
	expUnix, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return false
	}
	return time.Now().UTC().Unix() <= expUnix
}

func signPayload(secret, encodedPayload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(encodedPayload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
