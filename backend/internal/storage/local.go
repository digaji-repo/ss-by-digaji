package storage

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrFileTooLarge = errors.New("file exceeds maximum allowed size")
	ErrInvalidPath  = errors.New("invalid storage path")
	ErrMissingChunk = errors.New("one or more upload chunks are missing")
)

// LocalStorage saves uploaded files outside any public web directory under StorageRoot.
type LocalStorage struct {
	rootAbs string
}

// NewLocalStorage initializes isolated main, temp chunk, and quarantine directories under rootDir.
func NewLocalStorage(rootDir string) (*LocalStorage, error) {
	abs, err := filepath.Abs(rootDir)
	if err != nil {
		return nil, fmt.Errorf("resolve storage root: %w", err)
	}
	for _, sub := range [][]string{
		{"rooms"},
		{"tmp", "chunks"},
		{"quarantine", "pending"},
		{"quarantine", "infected"},
	} {
		if err := os.MkdirAll(filepath.Join(append([]string{abs}, sub...)...), 0o750); err != nil {
			return nil, fmt.Errorf("create storage subdir %v: %w", sub, err)
		}
	}
	return &LocalStorage{rootAbs: abs}, nil
}

func (l *LocalStorage) safeJoin(relParts ...string) (string, error) {
	joined := filepath.Join(append([]string{l.rootAbs}, relParts...)...)
	clean := filepath.Clean(joined)
	prefix := l.rootAbs + string(filepath.Separator)
	if clean != l.rootAbs && !strings.HasPrefix(clean, prefix) {
		return "", ErrInvalidPath
	}
	return clean, nil
}

// writeLimitedStream streams r directly to destAbs while capping bytes and capturing the 512-byte signature header.
func writeLimitedStream(destAbs string, r io.Reader, maxBytes int64) (int64, []byte, error) {
	f, err := os.OpenFile(destAbs, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return 0, nil, err
	}

	cleanupOnError := true
	defer func() {
		_ = f.Close()
		if cleanupOnError {
			_ = os.Remove(destAbs)
		}
	}()

	headerBuf := make([]byte, 0, 512)
	buf := make([]byte, 64*1024)
	var written int64
	limited := io.LimitReader(r, maxBytes+1)

	for {
		n, readErr := limited.Read(buf)
		if n > 0 {
			written += int64(n)
			if written > maxBytes {
				return 0, nil, ErrFileTooLarge
			}
			if len(headerBuf) < 512 {
				need := 512 - len(headerBuf)
				if n < need {
					need = n
				}
				headerBuf = append(headerBuf, buf[:need]...)
			}
			if _, writeErr := f.Write(buf[:n]); writeErr != nil {
				return 0, nil, writeErr
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return 0, nil, readErr
		}
	}

	cleanupOnError = false
	return written, headerBuf, nil
}

// SaveQuarantineStream writes an incoming upload stream into isolated pending quarantine for scanning before release.
func (l *LocalStorage) SaveQuarantineStream(r io.Reader, maxBytes int64) (*QuarantineFile, error) {
	id := uuid.NewString()
	pendingDir, err := l.safeJoin("quarantine", "pending")
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(pendingDir, 0o750); err != nil {
		return nil, err
	}
	destAbs, err := l.safeJoin("quarantine", "pending", id+".tmp")
	if err != nil {
		return nil, err
	}

	written, header, err := writeLimitedStream(destAbs, r, maxBytes)
	if err != nil {
		return nil, err
	}
	return &QuarantineFile{
		ID:          id,
		AbsPath:     destAbs,
		Size:        written,
		HeaderBytes: header,
	}, nil
}

// PromoteQuarantine moves a verified quarantine file into a room's isolated directory under a random filename.
func (l *LocalStorage) PromoteQuarantine(q *QuarantineFile, roomID, storedName string) (*SavedStreamResult, error) {
	if q == nil {
		return nil, ErrInvalidPath
	}
	if _, err := uuid.Parse(roomID); err != nil {
		return nil, ErrInvalidPath
	}
	roomDir, err := l.safeJoin("rooms", roomID)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(roomDir, 0o750); err != nil {
		return nil, err
	}

	safeName := filepath.Base(storedName)
	destAbs, err := l.safeJoin("rooms", roomID, safeName)
	if err != nil {
		return nil, err
	}

	if err := moveFile(q.AbsPath, destAbs, 0o640); err != nil {
		return nil, err
	}

	relPath := filepath.ToSlash(filepath.Join("rooms", roomID, safeName))
	return &SavedStreamResult{
		StoragePath: relPath,
		Size:        q.Size,
		HeaderBytes: q.HeaderBytes,
	}, nil
}

// QuarantineInfected isolates a malware-flagged file into quarantine/infected/ with restrictive non-executable permissions.
func (l *LocalStorage) QuarantineInfected(q *QuarantineFile, _ string) error {
	if q == nil {
		return nil
	}
	infectedDir, err := l.safeJoin("quarantine", "infected")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(infectedDir, 0o750); err != nil {
		return err
	}
	destAbs, err := l.safeJoin("quarantine", "infected", q.ID+".infected")
	if err != nil {
		return err
	}
	return moveFile(q.AbsPath, destAbs, 0o600)
}

// DeleteQuarantine deletes an unverified quarantine file immediately.
func (l *LocalStorage) DeleteQuarantine(q *QuarantineFile) error {
	if q == nil || q.AbsPath == "" {
		return nil
	}
	err := os.Remove(q.AbsPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func moveFile(srcAbs, dstAbs string, mode os.FileMode) error {
	if err := os.Rename(srcAbs, dstAbs); err == nil {
		_ = os.Chmod(dstAbs, mode)
		return nil
	}
	src, err := os.Open(srcAbs)
	if err != nil {
		return err
	}
	dst, err := os.OpenFile(dstAbs, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		_ = src.Close()
		return err
	}
	_, copyErr := io.Copy(dst, src)
	_ = src.Close()
	closeErr := dst.Close()
	if copyErr != nil {
		_ = os.Remove(dstAbs)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(dstAbs)
		return closeErr
	}
	_ = os.Remove(srcAbs)
	return nil
}

// SaveStream streams r directly to room storage (retained for Backend compatibility).
func (l *LocalStorage) SaveStream(roomID, storedName string, r io.Reader, maxBytes int64) (*SavedStreamResult, error) {
	if _, err := uuid.Parse(roomID); err != nil {
		return nil, ErrInvalidPath
	}
	roomDir, err := l.safeJoin("rooms", roomID)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(roomDir, 0o750); err != nil {
		return nil, err
	}

	safeName := filepath.Base(storedName)
	destPath, err := l.safeJoin("rooms", roomID, safeName)
	if err != nil {
		return nil, err
	}

	written, headerBuf, err := writeLimitedStream(destPath, r, maxBytes)
	if err != nil {
		return nil, err
	}
	_ = os.Chmod(destPath, 0o640)

	relPath := filepath.ToSlash(filepath.Join("rooms", roomID, safeName))
	return &SavedStreamResult{
		StoragePath: relPath,
		Size:        written,
		HeaderBytes: headerBuf,
	}, nil
}

// Open opens a stored file safely inside STORAGE_ROOT.
func (l *LocalStorage) Open(storagePath string) (*os.File, error) {
	cleanRel := filepath.FromSlash(strings.TrimLeft(storagePath, "/"))
	abs, err := l.safeJoin(cleanRel)
	if err != nil {
		return nil, err
	}
	return os.Open(abs)
}

// OverwriteBytes safely replaces the contents of an existing stored file inside STORAGE_ROOT.
func (l *LocalStorage) OverwriteBytes(storagePath string, data []byte) error {
	cleanRel := filepath.FromSlash(strings.TrimLeft(storagePath, "/"))
	abs, err := l.safeJoin(cleanRel)
	if err != nil {
		return err
	}
	return os.WriteFile(abs, data, 0o640)
}

// Delete deletes a stored file inside STORAGE_ROOT.
func (l *LocalStorage) Delete(storagePath string) error {
	cleanRel := filepath.FromSlash(strings.TrimLeft(storagePath, "/"))
	abs, err := l.safeJoin(cleanRel)
	if err != nil {
		return err
	}
	err = os.Remove(abs)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// DeleteRoomDir deletes the entire isolated directory for a room.
func (l *LocalStorage) DeleteRoomDir(roomID string) error {
	if _, err := uuid.Parse(roomID); err != nil {
		return ErrInvalidPath
	}
	dir, err := l.safeJoin("rooms", roomID)
	if err != nil {
		return err
	}
	return os.RemoveAll(dir)
}

// ListRoomDirs returns all room directory names currently present under STORAGE_ROOT/rooms.
func (l *LocalStorage) ListRoomDirs() ([]string, error) {
	baseDir, err := l.safeJoin("rooms")
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			out = append(out, entry.Name())
		}
	}
	return out, nil
}

// WriteChunk writes a single chunk part for resumable large uploads.
func (l *LocalStorage) WriteChunk(uploadID string, index int, r io.Reader, maxChunkBytes int64) (int64, error) {
	if _, err := uuid.Parse(uploadID); err != nil || index < 0 {
		return 0, ErrInvalidPath
	}
	dir, err := l.safeJoin("tmp", "chunks", uploadID)
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return 0, err
	}

	partPath, err := l.safeJoin("tmp", "chunks", uploadID, fmt.Sprintf("%d.part", index))
	if err != nil {
		return 0, err
	}

	f, err := os.OpenFile(partPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	n, err := io.Copy(f, io.LimitReader(r, maxChunkBytes+1))
	if err != nil {
		_ = os.Remove(partPath)
		return 0, err
	}
	if n > maxChunkBytes {
		_ = os.Remove(partPath)
		return 0, ErrFileTooLarge
	}
	return n, nil
}

// ListChunkIndices returns chunk indices currently saved on disk for uploadID.
func (l *LocalStorage) ListChunkIndices(uploadID string) ([]int, error) {
	if _, err := uuid.Parse(uploadID); err != nil {
		return nil, ErrInvalidPath
	}
	dir, err := l.safeJoin("tmp", "chunks", uploadID)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []int{}, nil
	}
	if err != nil {
		return nil, err
	}
	indices := make([]int, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".part") {
			continue
		}
		numStr := strings.TrimSuffix(name, ".part")
		if idx, err := strconv.Atoi(numStr); err == nil && idx >= 0 {
			indices = append(indices, idx)
		}
	}
	return indices, nil
}

// AssembleChunksToQuarantine sequentially merges chunks into pending quarantine for verification and scanning.
func (l *LocalStorage) AssembleChunksToQuarantine(uploadID string, totalChunks int, maxBytes int64) (*QuarantineFile, error) {
	if _, err := uuid.Parse(uploadID); err != nil {
		return nil, ErrInvalidPath
	}
	pendingDir, err := l.safeJoin("quarantine", "pending")
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(pendingDir, 0o750); err != nil {
		return nil, err
	}

	id := uuid.NewString()
	destAbs, err := l.safeJoin("quarantine", "pending", id+".tmp")
	if err != nil {
		return nil, err
	}

	dest, err := os.OpenFile(destAbs, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return nil, err
	}

	cleanupOnError := true
	defer func() {
		_ = dest.Close()
		if cleanupOnError {
			_ = os.Remove(destAbs)
		}
	}()

	headerBuf := make([]byte, 0, 512)
	buf := make([]byte, 64*1024)
	var totalWritten int64

	for i := 0; i < totalChunks; i++ {
		partPath, err := l.safeJoin("tmp", "chunks", uploadID, fmt.Sprintf("%d.part", i))
		if err != nil {
			return nil, err
		}
		partFile, err := os.Open(partPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, ErrMissingChunk
			}
			return nil, err
		}

		for {
			n, readErr := partFile.Read(buf)
			if n > 0 {
				totalWritten += int64(n)
				if totalWritten > maxBytes {
					_ = partFile.Close()
					return nil, ErrFileTooLarge
				}
				if len(headerBuf) < 512 {
					need := 512 - len(headerBuf)
					if n < need {
						need = n
					}
					headerBuf = append(headerBuf, buf[:need]...)
				}
				if _, writeErr := dest.Write(buf[:n]); writeErr != nil {
					_ = partFile.Close()
					return nil, writeErr
				}
			}
			if readErr == io.EOF {
				break
			}
			if readErr != nil {
				_ = partFile.Close()
				return nil, readErr
			}
		}
		_ = partFile.Close()
	}

	cleanupOnError = false
	_ = l.DeleteUploadTemp(uploadID)

	return &QuarantineFile{
		ID:          id,
		AbsPath:     destAbs,
		Size:        totalWritten,
		HeaderBytes: headerBuf,
	}, nil
}

// AssembleChunks assembles chunk parts via quarantine into destination room directory.
func (l *LocalStorage) AssembleChunks(roomID, uploadID, storedName string, totalChunks int, maxBytes int64) (*SavedStreamResult, error) {
	q, err := l.AssembleChunksToQuarantine(uploadID, totalChunks, maxBytes)
	if err != nil {
		return nil, err
	}
	res, err := l.PromoteQuarantine(q, roomID, storedName)
	if err != nil {
		_ = l.DeleteQuarantine(q)
		return nil, err
	}
	return res, nil
}

// DeleteUploadTemp removes temporary chunk directories.
func (l *LocalStorage) DeleteUploadTemp(uploadID string) error {
	if _, err := uuid.Parse(uploadID); err != nil {
		return ErrInvalidPath
	}
	dir, err := l.safeJoin("tmp", "chunks", uploadID)
	if err != nil {
		return err
	}
	return os.RemoveAll(dir)
}

// CleanupStaleChunks removes orphaned temp chunk folders and expired quarantine staging files.
func (l *LocalStorage) CleanupStaleChunks(maxAgeSeconds int64) error {
	cutoff := time.Now().Add(-time.Duration(maxAgeSeconds) * time.Second)

	baseDir, err := l.safeJoin("tmp", "chunks")
	if err == nil {
		if entries, readErr := os.ReadDir(baseDir); readErr == nil {
			for _, entry := range entries {
				if !entry.IsDir() {
					continue
				}
				if info, infoErr := entry.Info(); infoErr == nil && info.ModTime().Before(cutoff) {
					_ = os.RemoveAll(filepath.Join(baseDir, entry.Name()))
				}
			}
		}
	}

	for _, qSub := range [][]string{{"quarantine", "pending"}, {"quarantine", "infected"}} {
		qDir, err := l.safeJoin(qSub...)
		if err != nil {
			continue
		}
		if entries, readErr := os.ReadDir(qDir); readErr == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					continue
				}
				if info, infoErr := entry.Info(); infoErr == nil && info.ModTime().Before(cutoff) {
					_ = os.Remove(filepath.Join(qDir, entry.Name()))
				}
			}
		}
	}
	return nil
}
