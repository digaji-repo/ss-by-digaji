package storage

import (
	"io"
	"os"
)

// SavedStreamResult summarizes a streamed file write in main storage.
type SavedStreamResult struct {
	StoragePath string
	Size        int64
	HeaderBytes []byte
}

// QuarantineFile represents an unverified uploaded payload staged inside isolated quarantine storage.
type QuarantineFile struct {
	ID          string
	AbsPath     string
	Size        int64
	HeaderBytes []byte
}

// Backend abstracts file storage so local disk and S3-compatible implementations can share one contract.
type Backend interface {
	SaveStream(roomID, storedName string, r io.Reader, maxBytes int64) (*SavedStreamResult, error)
	SaveQuarantineStream(r io.Reader, maxBytes int64) (*QuarantineFile, error)
	PromoteQuarantine(q *QuarantineFile, roomID, storedName string) (*SavedStreamResult, error)
	QuarantineInfected(q *QuarantineFile, reason string) error
	DeleteQuarantine(q *QuarantineFile) error
	OverwriteBytes(storagePath string, data []byte) error
	Open(storagePath string) (*os.File, error)
	Delete(storagePath string) error
	DeleteRoomDir(roomID string) error
	ListRoomDirs() ([]string, error)
	WriteChunk(uploadID string, index int, r io.Reader, maxChunkBytes int64) (int64, error)
	ListChunkIndices(uploadID string) ([]int, error)
	AssembleChunks(roomID, uploadID, storedName string, totalChunks int, maxBytes int64) (*SavedStreamResult, error)
	AssembleChunksToQuarantine(uploadID string, totalChunks int, maxBytes int64) (*QuarantineFile, error)
	DeleteUploadTemp(uploadID string) error
	CleanupStaleChunks(maxAgeSeconds int64) error
}
