package server_test

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/config"
	"github.com/droproom/backend/internal/database"
	"github.com/droproom/backend/internal/models"
	"github.com/droproom/backend/internal/realtime"
	"github.com/droproom/backend/internal/server"
	"github.com/droproom/backend/internal/storage"
	"github.com/droproom/backend/internal/worker"
	"github.com/gorilla/websocket"
)

type testHarness struct {
	ts          *httptest.Server
	db          *sql.DB
	cache       *cache.Client
	store       *storage.LocalStorage
	hub         *realtime.Hub
	worker      *worker.CleanupWorker
	storageRoot string
	cfg         *config.Config
}

func setupIntegration(t *testing.T, customizeCfg ...func(*config.Config)) *testHarness {
	t.Helper()
	ctx := context.Background()
	loaded := config.Load()

	testDBName := os.Getenv("TEST_MYSQL_DATABASE")
	if testDBName == "" {
		testDBName = "droproom_test"
	}

	db, err := database.Connect(ctx, database.MySQLParams{
		Host:     loaded.MySQLHost,
		Port:     loaded.MySQLPort,
		User:     loaded.MySQLUser,
		Password: loaded.MySQLPassword,
		Database: testDBName,
	})
	if err != nil {
		t.Fatalf("mysql connect failed: %v", err)
	}
	if err := database.RunMigrations(ctx, db); err != nil {
		t.Fatalf("migrations failed: %v", err)
	}

	cacheClient, err := cache.Connect(ctx, loaded.RedisAddr, loaded.RedisPassword, 1)
	if err != nil {
		_ = db.Close()
		t.Fatalf("redis connect failed: %v", err)
	}
	_ = cacheClient.RDB.FlushDB(ctx).Err()

	_, _ = db.ExecContext(ctx, `DELETE FROM rooms`)

	storageRoot := t.TempDir()
	store, err := storage.NewLocalStorage(storageRoot)
	if err != nil {
		t.Fatalf("storage init failed: %v", err)
	}

	cfg := &config.Config{
		AppEnv:                     "test",
		CORSAllowedOrigins:         []string{"*"},
		TokenSecret:                "integration-test-secret-32bytes-ok",
		CookieSecure:               false,
		StorageRoot:                storageRoot,
		MaxFileSizeBytes:           20 * 1024 * 1024,
		DefaultStorageLimitBytes:   50 * 1024 * 1024,
		MaxPasteSizeBytes:          1024 * 1024,
		CleanupInterval:            5 * time.Second,
		ExpiringWarningWindow:      5 * time.Minute,
		ExpiredTombstoneRetention:  24 * time.Hour,
		ChunkUploadTTL:             2 * time.Hour,
		RateLimitRequestsPerMinute:  1000,
		RLCreateRoomPerMin:          5,
		RLJoinRoomPerMin:            60,
		RLRoomProbe404PerMin:        15,
		RLValidatePWPerMinRoom:      30,
		RLWSHandshakePerMin:         15,
		MaxConcurrentUploadsPerIP:   5,
		MaxConcurrentDownloadsPerIP: 4,
		MaxWSPerIP:                  5,
		MaxWSPerRoom:                50,
		PasswordMaxAttempts:         3,
		PasswordLockoutDuration:     2 * time.Minute,
		MaxPreviewBytes:             25 * 1024 * 1024,
		MaxDocxUncompressedBytes:    30 * 1024 * 1024,
	}
	for _, fn := range customizeCfg {
		if fn != nil {
			fn(cfg)
		}
	}

	hub := realtime.NewHub(cacheClient)
	w := worker.NewCleanupWorker(
		db, cacheClient, store, hub,
		cfg.CleanupInterval, cfg.ExpiringWarningWindow, cfg.ExpiredTombstoneRetention, cfg.ChunkUploadTTL,
	)

	router := server.NewRouter(db, cacheClient, store, hub, cfg)
	ts := httptest.NewServer(router)

	t.Cleanup(func() {
		ts.Close()
		_ = cacheClient.RDB.FlushDB(context.Background()).Err()
		_ = cacheClient.Close()
		_, _ = db.ExecContext(context.Background(), `DELETE FROM rooms`)
		_ = db.Close()
	})

	return &testHarness{
		ts:          ts,
		db:          db,
		cache:       cacheClient,
		store:       store,
		hub:         hub,
		worker:      w,
		storageRoot: storageRoot,
		cfg:         cfg,
	}
}

func doJSON(t *testing.T, method, url string, body interface{}, headers map[string]string) (*http.Response, []byte) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request %s %s: %v", method, url, err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return res, data
}

func TestEndToEndRoomFilesPastesWSAndCleanup(t *testing.T) {
	h := setupIntegration(t)

	// 1. Health Check
	res, _ := doJSON(t, http.MethodGet, h.ts.URL+"/api/health", nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 health, got %d", res.StatusCode)
	}

	// 2. Reject invalid expiration duration
	res, _ = doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms", map[string]interface{}{
		"duration_unit":  "days",
		"duration_value": 10,
	}, nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for >7d duration, got %d", res.StatusCode)
	}

	// 3. Create password-protected custom room
	res, body := doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms", map[string]interface{}{
		"room_code":      "qwe",
		"duration_unit":  "minutes",
		"duration_value": 15,
		"password":       "topsecret",
	}, nil)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 create room, got %d body=%s", res.StatusCode, string(body))
	}

	var created models.RoomResponse
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("unmarshal created room: %v", err)
	}
	if created.RoomCode != "QWE" || !created.HasPassword || created.AccessToken == "" {
		t.Fatalf("unexpected room response: %+v", created)
	}

	// Duplicate custom code -> 409 Conflict
	res, _ = doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms", map[string]interface{}{
		"room_code":      "QWE",
		"duration_unit":  "hours",
		"duration_value": 1,
	}, nil)
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("expected 409 duplicate custom code, got %d", res.StatusCode)
	}

	// 4. Unauthorized access to protected room files -> 401
	res, _ = doJSON(t, http.MethodGet, h.ts.URL+"/api/rooms/QWE/files", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", res.StatusCode)
	}

	// Password brute-force lockout test on a separate room
	_, _ = doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms", map[string]interface{}{
		"room_code":      "LCK",
		"duration_unit":  "minutes",
		"duration_value": 5,
		"password":       "correct",
	}, nil)
	for i := 0; i < h.cfg.PasswordMaxAttempts; i++ {
		res, _ = doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms/LCK/validate", map[string]string{
			"password": "wrong",
		}, nil)
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("attempt %d expected 401, got %d", i+1, res.StatusCode)
		}
	}
	res, _ = doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms/LCK/validate", map[string]string{
		"password": "correct",
	}, nil)
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429 lockout after max failures, got %d", res.StatusCode)
	}

	// Valid validate on QWE
	res, body = doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms/QWE/validate", map[string]string{
		"password": "topsecret",
	}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 validate, got %d body=%s", res.StatusCode, string(body))
	}
	var validated models.RoomResponse
	_ = json.Unmarshal(body, &validated)
	authHeaders := map[string]string{"X-Room-Token": validated.AccessToken}

	// 5. Connect WebSocket client to QWE
	wsURL := "ws" + strings.TrimPrefix(h.ts.URL, "http") + "/ws/rooms/QWE?token=" + validated.AccessToken + "&peer_id=test-peer-1"
	wsConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial failed: %v", err)
	}
	defer wsConn.Close()

	var firstMsg realtime.Envelope
	_ = wsConn.SetReadDeadline(time.Now().Add(3 * time.Second))
	if err := wsConn.ReadJSON(&firstMsg); err != nil {
		t.Fatalf("read room.joined: %v", err)
	}
	if firstMsg.Type != realtime.EventRoomJoined {
		t.Fatalf("expected room.joined, got %s", firstMsg.Type)
	}

	// 6. Streaming multipart upload (allowed + blocked)
	var mpBuf bytes.Buffer
	mw := multipart.NewWriter(&mpBuf)
	fw, _ := mw.CreateFormFile("files", "hello.txt")
	_, _ = fw.Write([]byte("DropRoom streaming payload"))
	_ = mw.Close()

	req, _ := http.NewRequest(http.MethodPost, h.ts.URL+"/api/rooms/QWE/files", &mpBuf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-Room-Token", validated.AccessToken)
	uploadRes, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	uploadBody, _ := io.ReadAll(uploadRes.Body)
	_ = uploadRes.Body.Close()
	if uploadRes.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 upload, got %d body=%s", uploadRes.StatusCode, string(uploadBody))
	}
	var uploadParsed struct {
		Files []models.FileRecord `json:"files"`
	}
	_ = json.Unmarshal(uploadBody, &uploadParsed)
	if len(uploadParsed.Files) != 1 {
		t.Fatalf("expected 1 uploaded file, got %d", len(uploadParsed.Files))
	}
	uploadedFile := uploadParsed.Files[0]

	// Blocked executable upload
	var badBuf bytes.Buffer
	badW := multipart.NewWriter(&badBuf)
	badF, _ := badW.CreateFormFile("files", "evil.exe")
	_, _ = badF.Write([]byte("MZ"))
	_ = badW.Close()
	badReq, _ := http.NewRequest(http.MethodPost, h.ts.URL+"/api/rooms/QWE/files", &badBuf)
	badReq.Header.Set("Content-Type", badW.FormDataContentType())
	badReq.Header.Set("X-Room-Token", validated.AccessToken)
	badRes, _ := http.DefaultClient.Do(badReq)
	_ = badRes.Body.Close()
	if badRes.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for blocked .exe, got %d", badRes.StatusCode)
	}

	// Preview should NOT increment download_count
	prevRes, prevBody := doJSON(t, http.MethodGet, h.ts.URL+"/api/files/"+uploadedFile.ID+"/preview", nil, authHeaders)
	if prevRes.StatusCode != http.StatusOK || string(prevBody) != "DropRoom streaming payload" {
		t.Fatalf("unexpected preview response: status=%d body=%q", prevRes.StatusCode, string(prevBody))
	}

	// Rename file (.txt -> .md) and verify extension blocking on rename (.exe)
	renBadRes, _ := doJSON(t, http.MethodPut, h.ts.URL+"/api/files/"+uploadedFile.ID, map[string]string{
		"original_name": "evil.exe",
	}, authHeaders)
	if renBadRes.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 renaming to .exe, got %d", renBadRes.StatusCode)
	}

	renRes, renBody := doJSON(t, http.MethodPut, h.ts.URL+"/api/files/"+uploadedFile.ID, map[string]string{
		"original_name": "notes.md",
	}, authHeaders)
	if renRes.StatusCode != http.StatusOK || !strings.Contains(string(renBody), "notes.md") {
		t.Fatalf("rename file failed: %d %s", renRes.StatusCode, string(renBody))
	}

	// Edit text/markdown file content
	editRes, editBody := doJSON(t, http.MethodPut, h.ts.URL+"/api/files/"+uploadedFile.ID+"/content", map[string]string{
		"content": "# Updated Markdown\nHello DropRoom",
	}, authHeaders)
	if editRes.StatusCode != http.StatusOK || !strings.Contains(string(editBody), "notes.md") {
		t.Fatalf("edit file content failed: %d %s", editRes.StatusCode, string(editBody))
	}

	// Download SHOULD increment download_count and serve updated content
	dlRes, dlBody := doJSON(t, http.MethodGet, h.ts.URL+"/api/files/"+uploadedFile.ID+"/download", nil, authHeaders)
	if dlRes.StatusCode != http.StatusOK || string(dlBody) != "# Updated Markdown\nHello DropRoom" {
		t.Fatalf("unexpected download response after edit: status=%d body=%q", dlRes.StatusCode, string(dlBody))
	}

	// 7. Chunked Resumable Upload (2 chunks, valid allowlisted ZIP header)
	fullChunkData := append([]byte{'P', 'K', 0x03, 0x04}, bytes.Repeat([]byte("A"), 1020)...)
	res, initBody := doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms/QWE/files/chunked/init", map[string]interface{}{
		"file_name":    "chunked.zip",
		"total_size":   len(fullChunkData),
		"chunk_size":   512,
		"content_type": "application/zip",
	}, authHeaders)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("chunked init failed: %d %s", res.StatusCode, string(initBody))
	}
	var chunkInit struct {
		UploadID string `json:"upload_id"`
	}
	_ = json.Unmarshal(initBody, &chunkInit)

	for idx, slice := range [][]byte{fullChunkData[:512], fullChunkData[512:]} {
		cReq, _ := http.NewRequest(
			http.MethodPut,
			fmt.Sprintf("%s/api/rooms/QWE/files/chunked/%s/chunks/%d", h.ts.URL, chunkInit.UploadID, idx),
			bytes.NewReader(slice),
		)
		cReq.Header.Set("X-Room-Token", validated.AccessToken)
		cRes, err := http.DefaultClient.Do(cReq)
		if err != nil || cRes.StatusCode != http.StatusOK {
			t.Fatalf("chunk %d upload failed: status=%v err=%v", idx, cRes, err)
		}
		_ = cRes.Body.Close()

		if idx == 0 {
			sRes, sBody := doJSON(
				t,
				http.MethodGet,
				fmt.Sprintf("%s/api/rooms/QWE/files/chunked/%s", h.ts.URL, chunkInit.UploadID),
				nil,
				authHeaders,
			)
			if sRes.StatusCode != http.StatusOK || !strings.Contains(string(sBody), "0") {
				t.Fatalf("expected resume status with chunk 0, got %d %s", sRes.StatusCode, string(sBody))
			}
		}
	}

	res, compBody := doJSON(
		t,
		http.MethodPost,
		fmt.Sprintf("%s/api/rooms/QWE/files/chunked/%s/complete", h.ts.URL, chunkInit.UploadID),
		nil,
		authHeaders,
	)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("chunked complete failed: %d %s", res.StatusCode, string(compBody))
	}
	var chunkedFile models.FileRecord
	_ = json.Unmarshal(compBody, &chunkedFile)
	dlChunkRes, dlChunkBody := doJSON(t, http.MethodGet, h.ts.URL+"/api/files/"+chunkedFile.ID+"/download", nil, authHeaders)
	if dlChunkRes.StatusCode != http.StatusOK || !bytes.Equal(dlChunkBody, fullChunkData) {
		t.Fatalf("chunked download mismatch: status=%d len=%d", dlChunkRes.StatusCode, len(dlChunkBody))
	}

	// 8. Paste CRUD
	res, pasteBody := doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms/QWE/pastes", map[string]string{
		"title":           "Main Go",
		"content":         "package main",
		"syntax_language": "go",
	}, authHeaders)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create paste failed: %d %s", res.StatusCode, string(pasteBody))
	}
	var paste models.Paste
	_ = json.Unmarshal(pasteBody, &paste)

	res, updBody := doJSON(t, http.MethodPut, h.ts.URL+"/api/pastes/"+paste.ID, map[string]string{
		"title":           "Updated Go",
		"content":         "package main\nfunc main() {}",
		"syntax_language": "go",
	}, authHeaders)
	if res.StatusCode != http.StatusOK || !strings.Contains(string(updBody), "Updated Go") {
		t.Fatalf("update paste failed: %d %s", res.StatusCode, string(updBody))
	}

	receivedTypes := make(map[string]bool)
	_ = wsConn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	for {
		var env realtime.Envelope
		if err := wsConn.ReadJSON(&env); err != nil {
			break
		}
		receivedTypes[env.Type] = true
	}
	for _, expected := range []string{
		realtime.EventRoomUserOnline,
		realtime.EventFileUploadStarted,
		realtime.EventFileUploadCompleted,
		realtime.EventFileUpdated,
		realtime.EventFileDownloaded,
		realtime.EventPasteCreated,
		realtime.EventPasteUpdated,
	} {
		if !receivedTypes[expected] {
			t.Fatalf("expected WS event %s, received=%v", expected, receivedTypes)
		}
	}

	// Word .docx binary preview & overwrite test (validates OOXML anti-zip-bomb + preview + PUT /api/files/{id}/binary)
	docxInitBytes := buildMinimalTestDocx("initial proposal content")
	var docxBuf bytes.Buffer
	dm := multipart.NewWriter(&docxBuf)
	df, _ := dm.CreateFormFile("files", "proposal.docx")
	_, _ = df.Write(docxInitBytes)
	_ = dm.Close()
	dReq, _ := http.NewRequest(http.MethodPost, h.ts.URL+"/api/rooms/QWE/files", &docxBuf)
	dReq.Header.Set("Content-Type", dm.FormDataContentType())
	dReq.Header.Set("X-Room-Token", validated.AccessToken)
	dRes, _ := http.DefaultClient.Do(dReq)
	dRaw, _ := io.ReadAll(dRes.Body)
	_ = dRes.Body.Close()
	if dRes.StatusCode != http.StatusCreated {
		t.Fatalf("upload docx failed: %d %s", dRes.StatusCode, string(dRaw))
	}
	var dParsed struct {
		Files []models.FileRecord `json:"files"`
	}
	_ = json.Unmarshal(dRaw, &dParsed)
	docxID := dParsed.Files[0].ID

	// Verify docx preview streams cleanly without 415
	docxPrevReq, _ := http.NewRequest(http.MethodGet, h.ts.URL+"/api/files/"+docxID+"/preview", nil)
	docxPrevReq.Header.Set("X-Room-Token", validated.AccessToken)
	docxPrevRes, _ := http.DefaultClient.Do(docxPrevReq)
	_ = docxPrevRes.Body.Close()
	if docxPrevRes.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on docx preview, got %d", docxPrevRes.StatusCode)
	}

	// Verify updating docx binary works and updates file size
	docxUpdatedBytes := buildMinimalTestDocx("updated proposal content with longer payload")
	var updBuf bytes.Buffer
	um := multipart.NewWriter(&updBuf)
	uf, _ := um.CreateFormFile("file", "proposal.docx")
	_, _ = uf.Write(docxUpdatedBytes)
	_ = um.Close()
	uReq, _ := http.NewRequest(http.MethodPut, h.ts.URL+"/api/files/"+docxID+"/binary", &updBuf)
	uReq.Header.Set("Content-Type", um.FormDataContentType())
	uReq.Header.Set("X-Room-Token", validated.AccessToken)
	uRes, _ := http.DefaultClient.Do(uReq)
	uRaw, _ := io.ReadAll(uRes.Body)
	_ = uRes.Body.Close()
	expectedSizeSnippet := fmt.Sprintf(`"file_size":%d`, len(docxUpdatedBytes))
	if uRes.StatusCode != http.StatusOK || !strings.Contains(string(uRaw), expectedSizeSnippet) {
		t.Fatalf("update docx binary failed: %d %s (want %s)", uRes.StatusCode, string(uRaw), expectedSizeSnippet)
	}

	// Bulk delete test: upload two small files and bulk-delete them
	var bulkUploadIDs []string
	for _, fname := range []string{"bulk1.txt", "bulk2.txt"} {
		var bBuf bytes.Buffer
		bm := multipart.NewWriter(&bBuf)
		bf, _ := bm.CreateFormFile("files", fname)
		_, _ = bf.Write([]byte("bulk content " + fname))
		_ = bm.Close()
		bReq, _ := http.NewRequest(http.MethodPost, h.ts.URL+"/api/rooms/QWE/files", &bBuf)
		bReq.Header.Set("Content-Type", bm.FormDataContentType())
		bReq.Header.Set("X-Room-Token", validated.AccessToken)
		bRes, _ := http.DefaultClient.Do(bReq)
		bRaw, _ := io.ReadAll(bRes.Body)
		_ = bRes.Body.Close()
		var bParsed struct {
			Files []models.FileRecord `json:"files"`
		}
		_ = json.Unmarshal(bRaw, &bParsed)
		bulkUploadIDs = append(bulkUploadIDs, bParsed.Files[0].ID)
	}
	res, bulkDelBody := doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms/QWE/files/bulk-delete", map[string]interface{}{
		"file_ids": bulkUploadIDs,
	}, authHeaders)
	if res.StatusCode != http.StatusOK || !strings.Contains(string(bulkDelBody), `"deleted_count":2`) {
		t.Fatalf("bulk delete failed: %d %s", res.StatusCode, string(bulkDelBody))
	}

	// 9. Expiration + Background Worker Cleanup (files, unfinished chunks, DB rows, and orphan sweep)
	// Start an unfinished chunked upload to verify temp chunks are wiped immediately on expiration
	res, partialInitBody := doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms/QWE/files/chunked/init", map[string]interface{}{
		"file_name":    "partial.zip",
		"total_size":   1024,
		"chunk_size":   512,
		"content_type": "application/zip",
	}, authHeaders)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("partial chunked init failed: %d", res.StatusCode)
	}
	var partialInit struct {
		UploadID string `json:"upload_id"`
	}
	_ = json.Unmarshal(partialInitBody, &partialInit)
	pReq, _ := http.NewRequest(
		http.MethodPut,
		fmt.Sprintf("%s/api/rooms/QWE/files/chunked/%s/chunks/0", h.ts.URL, partialInit.UploadID),
		bytes.NewReader(bytes.Repeat([]byte("Z"), 512)),
	)
	pReq.Header.Set("X-Room-Token", validated.AccessToken)
	pRes, _ := http.DefaultClient.Do(pReq)
	_ = pRes.Body.Close()

	partialChunkDir := filepath.Join(h.storageRoot, "tmp", "chunks", partialInit.UploadID)
	if _, err := os.Stat(partialChunkDir); err != nil {
		t.Fatalf("expected partial chunk dir before cleanup: %v", err)
	}

	// Simulate an orphaned disk directory from a deleted/missing room
	orphanDir := filepath.Join(h.storageRoot, "rooms", "00000000-0000-0000-0000-00000000dead")
	_ = os.MkdirAll(orphanDir, 0o750)
	_ = os.WriteFile(filepath.Join(orphanDir, "leftover.txt"), []byte("orphan"), 0o640)

	roomDiskDir := filepath.Join(h.storageRoot, "rooms", created.ID)
	if _, err := os.Stat(roomDiskDir); err != nil {
		t.Fatalf("expected room disk dir to exist before cleanup: %v", err)
	}

	_, err = h.db.ExecContext(context.Background(), `UPDATE rooms SET expires_at = ? WHERE id = ?`, time.Now().UTC().Add(-10*time.Second), created.ID)
	if err != nil {
		t.Fatalf("force expire room failed: %v", err)
	}
	h.worker.RunOnce(context.Background())

	res, _ = doJSON(t, http.MethodGet, h.ts.URL+"/api/rooms/QWE", nil, nil)
	if res.StatusCode != http.StatusGone {
		t.Fatalf("expected 410 Gone after worker expiration, got %d", res.StatusCode)
	}

	if _, err := os.Stat(roomDiskDir); !os.IsNotExist(err) {
		t.Fatalf("expected room disk dir %s to be deleted after expiration", roomDiskDir)
	}
	if _, err := os.Stat(partialChunkDir); !os.IsNotExist(err) {
		t.Fatalf("expected partial chunk dir %s to be deleted after expiration", partialChunkDir)
	}
	if _, err := os.Stat(orphanDir); !os.IsNotExist(err) {
		t.Fatalf("expected orphan room dir %s to be swept", orphanDir)
	}

	for _, table := range []string{"files", "pastes", "download_logs"} {
		var cnt int
		if err := h.db.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM "+table+" WHERE room_id = ?", created.ID).Scan(&cnt); err != nil || cnt != 0 {
			t.Fatalf("expected 0 rows in %s for expired room, got %d err=%v", table, cnt, err)
		}
	}

	res, _ = doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms", map[string]interface{}{
		"room_code":      "QWE",
		"duration_unit":  "minutes",
		"duration_value": 5,
	}, nil)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected expired code QWE to be reusable, got %d", res.StatusCode)
	}
}

func buildMinimalTestDocx(text string) []byte {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	ct, _ := zw.Create("[Content_Types].xml")
	_, _ = ct.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`))
	doc, _ := zw.Create("word/document.xml")
	_, _ = doc.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p><w:r><w:t>` + text + `</w:t></w:r></w:p></w:body></w:document>`))
	_ = zw.Close()
	return buf.Bytes()
}

func TestSecurityQuarantineMalwareAndRateLimits(t *testing.T) {
	// Mock clamd TCP INSTREAM server that treats payloads containing "EICAR-TEST" as infected.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("mock clamd listen failed: %v", err)
	}
	defer func() { _ = ln.Close() }()

	go func() {
		for {
			conn, aErr := ln.Accept()
			if aErr != nil {
				return
			}
			go func(c net.Conn) {
				defer func() { _ = c.Close() }()
				var payload bytes.Buffer
				tmp := make([]byte, 4096)
				for {
					n, rErr := c.Read(tmp)
					if n > 0 {
						payload.Write(tmp[:n])
						if bytes.HasSuffix(payload.Bytes(), []byte{0, 0, 0, 0}) {
							if bytes.Contains(payload.Bytes(), []byte("EICAR-TEST")) {
								_, _ = c.Write([]byte("stream: Eicar-Test-Signature FOUND\x00"))
							} else {
								_, _ = c.Write([]byte("stream: OK\x00"))
							}
							return
						}
					}
					if rErr != nil {
						return
					}
				}
			}(conn)
		}
	}()

	h := setupIntegration(t, func(cfg *config.Config) {
		cfg.ClamAVEnabled = true
		cfg.ClamAVAddr = ln.Addr().String()
		cfg.ClamAVTimeout = 2 * time.Second
		cfg.RLCreateRoomPerMin = 5
		cfg.RLRoomProbe404PerMin = 3
	})

	// Create room SEC
	res, _ := doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms", map[string]interface{}{
		"room_code":      "SEC",
		"duration_unit":  "minutes",
		"duration_value": 15,
	}, nil)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create SEC room failed: %d", res.StatusCode)
	}

	// 1. Disallowed macro extension (.docm) rejected before quarantine
	var badExtBuf bytes.Buffer
	mw := multipart.NewWriter(&badExtBuf)
	p1, _ := mw.CreateFormFile("files", "invoice.docm")
	_, _ = p1.Write(buildMinimalTestDocx("macro"))
	_ = mw.Close()
	r1, _ := http.NewRequest(http.MethodPost, h.ts.URL+"/api/rooms/SEC/files", &badExtBuf)
	r1.Header.Set("Content-Type", mw.FormDataContentType())
	res1, _ := http.DefaultClient.Do(r1)
	_ = res1.Body.Close()
	if res1.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for .docm macro doc, got %d", res1.StatusCode)
	}

	// 2. Forged signature (HTML claiming to be .pdf) rejected with 400
	var fakePdfBuf bytes.Buffer
	mw2 := multipart.NewWriter(&fakePdfBuf)
	p2, _ := mw2.CreateFormFile("files", "trap.pdf")
	_, _ = p2.Write([]byte("<html><script>alert(1)</script></html>"))
	_ = mw2.Close()
	r2, _ := http.NewRequest(http.MethodPost, h.ts.URL+"/api/rooms/SEC/files", &fakePdfBuf)
	r2.Header.Set("Content-Type", mw2.FormDataContentType())
	res2, _ := http.DefaultClient.Do(r2)
	_ = res2.Body.Close()
	if res2.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for forged .pdf header, got %d", res2.StatusCode)
	}

	// 3. Malware detected by ClamAV -> HTTP 422 & isolated in quarantine/infected/
	var malBuf bytes.Buffer
	mw3 := multipart.NewWriter(&malBuf)
	p3, _ := mw3.CreateFormFile("files", "bad-notes.txt")
	_, _ = p3.Write([]byte("hello EICAR-TEST virus signature"))
	_ = mw3.Close()
	r3, _ := http.NewRequest(http.MethodPost, h.ts.URL+"/api/rooms/SEC/files", &malBuf)
	r3.Header.Set("Content-Type", mw3.FormDataContentType())
	res3, err3 := http.DefaultClient.Do(r3)
	if err3 != nil {
		t.Fatal(err3)
	}
	raw3, _ := io.ReadAll(res3.Body)
	_ = res3.Body.Close()
	if res3.StatusCode != http.StatusUnprocessableEntity || !strings.Contains(string(raw3), "malware_detected") {
		t.Fatalf("expected 422 malware_detected, got %d %s", res3.StatusCode, string(raw3))
	}

	infectedEntries, _ := os.ReadDir(filepath.Join(h.storageRoot, "quarantine", "infected"))
	if len(infectedEntries) == 0 {
		t.Fatal("expected infected upload to be isolated in quarantine/infected")
	}

	// 4. Clean upload passes ClamAV, promotes out of quarantine, and stores with random <uuid>.bin filename
	var cleanBuf bytes.Buffer
	mw4 := multipart.NewWriter(&cleanBuf)
	p4, _ := mw4.CreateFormFile("files", "clean-secret-name.txt")
	_, _ = p4.Write([]byte("safe text payload"))
	_ = mw4.Close()
	r4, _ := http.NewRequest(http.MethodPost, h.ts.URL+"/api/rooms/SEC/files", &cleanBuf)
	r4.Header.Set("Content-Type", mw4.FormDataContentType())
	res4, raw4 := func() (*http.Response, []byte) {
		resp, err := http.DefaultClient.Do(r4)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		return resp, b
	}()
	if res4.StatusCode != http.StatusCreated || !strings.Contains(string(raw4), `"original_name":"clean-secret-name.txt"`) {
		t.Fatalf("expected clean upload to succeed, got %d %s", res4.StatusCode, string(raw4))
	}

	var storedName string
	_ = h.db.QueryRowContext(context.Background(), `SELECT stored_name FROM files WHERE original_name = 'clean-secret-name.txt'`).Scan(&storedName)
	if !strings.HasSuffix(storedName, ".bin") || strings.Contains(storedName, "clean-secret-name") {
		t.Fatalf("expected random <uuid>.bin filename on disk, got %q", storedName)
	}

	// 5. Granular rate limit on POST /api/rooms (5 / min / IP)
	rlHeaders := map[string]string{"X-Forwarded-For": "203.0.113.55"}
	for i := 0; i < 5; i++ {
		resp, _ := doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms", map[string]interface{}{
			"duration_unit":  "minutes",
			"duration_value": 5,
		}, rlHeaders)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected room creation #%d to pass, got %d", i+1, resp.StatusCode)
		}
	}
	sixthRes, sixthBody := doJSON(t, http.MethodPost, h.ts.URL+"/api/rooms", map[string]interface{}{
		"duration_unit":  "minutes",
		"duration_value": 5,
	}, rlHeaders)
	if sixthRes.StatusCode != http.StatusTooManyRequests || !strings.Contains(string(sixthBody), "rate_limited") {
		t.Fatalf("expected 6th create room in 1 min to return 429 rate_limited, got %d %s", sixthRes.StatusCode, string(sixthBody))
	}

	// 6. Active room reloads stay smooth while repeated 404 code probes get rate-limited
	probeHeaders := map[string]string{"X-Forwarded-For": "203.0.113.88"}
	for i := 0; i < 6; i++ {
		okRes, _ := doJSON(t, http.MethodGet, h.ts.URL+"/api/rooms/SEC", nil, probeHeaders)
		if okRes.StatusCode != http.StatusOK {
			t.Fatalf("expected valid room lookup #%d to return 200, got %d", i+1, okRes.StatusCode)
		}
	}
	for i := 0; i < 3; i++ {
		missRes, _ := doJSON(t, http.MethodGet, h.ts.URL+"/api/rooms/ZZZ", nil, probeHeaders)
		if missRes.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404 on miss #%d, got %d", i+1, missRes.StatusCode)
		}
	}
	fourthMiss, _ := doJSON(t, http.MethodGet, h.ts.URL+"/api/rooms/ZZZ", nil, probeHeaders)
	if fourthMiss.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429 rate_limited after exceeding 404 probe threshold, got %d", fourthMiss.StatusCode)
	}
}
