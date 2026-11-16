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
	ErrFileTooLarge  = errors.New("file exceeds maximum allowed size")
	ErrInvalidPath   = errors.New("invalid storage path")
	ErrMissingChunk  = errors.New("one or more upload chunks are missing")
)

// LocalStorage saves uploaded files outside any public web directory under StorageRoot.
type LocalStorage struct {
	rootAbs string
}

// NewLocalStorage initializes local isolated directories under rootDir.
func NewLocalStorage(rootDir string) (*LocalStorage, error) {
	abs, err := filepath.Abs(rootDir)
	if err != nil {
		return nil, fmt.Errorf("resolve storage root: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(abs, "rooms"), 0o750); err != nil {
		return nil, fmt.Errorf("create rooms storage dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(abs, "tmp", "chunks"), 0o750); err != nil {
		return nil, fmt.Errorf("create temp chunks dir: %w", err)
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

// SaveStream streams r directly to disk without buffering the entire file in memory.
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

	destPath, err := l.safeJoin("rooms", roomID, filepath.Base(storedName))
	if err != nil {
		return nil, err
	}

	f, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return nil, err
	}

	cleanupOnError := true
	defer func() {
		_ = f.Close()
		if cleanupOnError {
			_ = os.Remove(destPath)
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
				return nil, ErrFileTooLarge
			}
			if len(headerBuf) < 512 {
				need := 512 - len(headerBuf)
				if n < need {
					need = n
				}
				headerBuf = append(headerBuf, buf[:need]...)
			}
			if _, writeErr := f.Write(buf[:n]); writeErr != nil {
				return nil, writeErr
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, readErr
		}
	}

	cleanupOnError = false
	relPath := filepath.ToSlash(filepath.Join("rooms", roomID, filepath.Base(storedName)))
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

	f, err := os.OpenFile(partPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
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

// AssembleChunks streams all chunk parts sequentially into the room's isolated destination file.
func (l *LocalStorage) AssembleChunks(roomID, uploadID, storedName string, totalChunks int, maxBytes int64) (*SavedStreamResult, error) {
	if _, err := uuid.Parse(roomID); err != nil {
		return nil, ErrInvalidPath
	}
	if _, err := uuid.Parse(uploadID); err != nil {
		return nil, ErrInvalidPath
	}
	roomDir, err := l.safeJoin("rooms", roomID)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(roomDir, 0o750); err != nil {
		return nil, err
	}

	destPath, err := l.safeJoin("rooms", roomID, filepath.Base(storedName))
	if err != nil {
		return nil, err
	}

	dest, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return nil, err
	}

	cleanupOnError := true
	defer func() {
		_ = dest.Close()
		if cleanupOnError {
			_ = os.Remove(destPath)
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

	relPath := filepath.ToSlash(filepath.Join("rooms", roomID, filepath.Base(storedName)))
	return &SavedStreamResult{
		StoragePath: relPath,
		Size:        totalWritten,
		HeaderBytes: headerBuf,
	}, nil
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

// CleanupStaleChunks removes orphaned chunk temp folders older than maxAgeSeconds.
func (l *LocalStorage) CleanupStaleChunks(maxAgeSeconds int64) error {
	baseDir, err := l.safeJoin("tmp", "chunks")
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	cutoff := time.Now().Add(-time.Duration(maxAgeSeconds) * time.Second)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			_ = os.RemoveAll(filepath.Join(baseDir, entry.Name()))
		}
	}
	return nil
}
