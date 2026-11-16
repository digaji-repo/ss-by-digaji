package security

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"time"
)

var (
	ErrMalwareDetected    = errors.New("malware or suspicious payload detected")
	ErrScannerUnavailable = errors.New("malware scanner unavailable")
)

// MalwareScanner defines the contract for scanning quarantined uploads before release.
type MalwareScanner interface {
	ScanFile(ctx context.Context, absPath string) error
}

// ClamAVScanner streams quarantined files over TCP INSTREAM protocol to clamd.
type ClamAVScanner struct {
	Addr    string
	Timeout time.Duration
}

// NewClamAVScanner creates a ClamAV clamd TCP scanner client.
func NewClamAVScanner(addr string, timeout time.Duration) *ClamAVScanner {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &ClamAVScanner{
		Addr:    addr,
		Timeout: timeout,
	}
}

// ScanFile streams the file at absPath to clamd and returns ErrMalwareDetected if a signature matches.
func (s *ClamAVScanner) ScanFile(ctx context.Context, absPath string) error {
	if s == nil || strings.TrimSpace(s.Addr) == "" {
		return ErrScannerUnavailable
	}

	dialer := net.Dialer{Timeout: s.Timeout}
	conn, err := dialer.DialContext(ctx, "tcp", s.Addr)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrScannerUnavailable, err)
	}
	defer func() { _ = conn.Close() }()

	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	} else {
		_ = conn.SetDeadline(time.Now().Add(s.Timeout))
	}

	if _, err := conn.Write([]byte("zINSTREAM\x00")); err != nil {
		return fmt.Errorf("%w: write header: %v", ErrScannerUnavailable, err)
	}

	f, err := os.Open(absPath)
	if err != nil {
		return fmt.Errorf("%w: open target: %v", ErrScannerUnavailable, err)
	}
	defer func() { _ = f.Close() }()

	buf := make([]byte, 32*1024)
	var lenPrefix [4]byte
	for {
		n, readErr := f.Read(buf)
		if n > 0 {
			binary.BigEndian.PutUint32(lenPrefix[:], uint32(n))
			if _, wErr := conn.Write(lenPrefix[:]); wErr != nil {
				return fmt.Errorf("%w: write chunk size: %v", ErrScannerUnavailable, wErr)
			}
			if _, wErr := conn.Write(buf[:n]); wErr != nil {
				return fmt.Errorf("%w: write chunk data: %v", ErrScannerUnavailable, wErr)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return fmt.Errorf("%w: read target: %v", ErrScannerUnavailable, readErr)
		}
	}

	// Terminate INSTREAM with 4 zero bytes.
	binary.BigEndian.PutUint32(lenPrefix[:], 0)
	if _, err := conn.Write(lenPrefix[:]); err != nil {
		return fmt.Errorf("%w: terminate stream: %v", ErrScannerUnavailable, err)
	}

	resp, err := bufio.NewReader(conn).ReadString('\x00')
	if err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("%w: read response: %v", ErrScannerUnavailable, err)
	}
	trimmed := strings.TrimSpace(strings.TrimRight(resp, "\x00"))
	if strings.HasSuffix(trimmed, "OK") {
		return nil
	}
	if strings.HasSuffix(trimmed, "FOUND") {
		return fmt.Errorf("%w: %s", ErrMalwareDetected, trimmed)
	}
	return fmt.Errorf("%w: unexpected clamd reply %q", ErrScannerUnavailable, trimmed)
}
