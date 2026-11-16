package security

import (
	"crypto/rand"
	"errors"
	"math/big"
	"strings"
)

const (
	roomCodeCharset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	roomCodeLength  = 3
)

var ErrInvalidRoomCode = errors.New("room code must be exactly 3 characters using A-Z and 0-9")

// GenerateRoomCode creates a cryptographically random 3-character room code (A-Z, 0-9).
func GenerateRoomCode() (string, error) {
	charsetLen := big.NewInt(int64(len(roomCodeCharset)))
	buf := make([]byte, roomCodeLength)
	for i := 0; i < roomCodeLength; i++ {
		n, err := rand.Int(rand.Reader, charsetLen)
		if err != nil {
			return "", err
		}
		buf[i] = roomCodeCharset[n.Int64()]
	}
	return string(buf), nil
}

// NormalizeRoomCode trims whitespace and uppercases a room code.
func NormalizeRoomCode(raw string) string {
	return strings.ToUpper(strings.TrimSpace(raw))
}

// ValidateRoomCode checks whether a code is exactly 3 A-Z0-9 characters.
func ValidateRoomCode(code string) (string, error) {
	norm := NormalizeRoomCode(code)
	if len(norm) != roomCodeLength {
		return "", ErrInvalidRoomCode
	}
	for i := 0; i < len(norm); i++ {
		c := norm[i]
		isUpper := c >= 'A' && c <= 'Z'
		isDigit := c >= '0' && c <= '9'
		if !isUpper && !isDigit {
			return "", ErrInvalidRoomCode
		}
	}
	return norm, nil
}
