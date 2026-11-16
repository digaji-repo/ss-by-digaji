# PRD — DropRoom
**Temporary File & Text Sharing Platform**

| Informasi | Detail |
|---|---|
| Project | DropRoom |
| Version | 1.0 |
| Platform | Web Application |
| Frontend | React + TypeScript |
| Backend | Go |
| Realtime | Go WebSocket |
| Database | PostgreSQL |
| Cache | Redis |
| UI | iOS Glassmorphism |

## 1. Project Overview

DropRoom adalah platform berbagi file dan teks sementara berbasis Room.

Pengguna tidak perlu registrasi maupun login. Cukup membuat room menggunakan kode unik 3 karakter atau masuk menggunakan kode room yang sudah tersedia.

Setiap room memiliki masa berlaku otomatis maksimal 7 hari.

### Tujuan

- Temporary File Sharing.
- Temporary Text & Script Paste.
- Realtime file dan paste sharing.
- Room-based collaboration.
- Tanpa login dan registrasi.
- Automatic expiration dan cleanup.

## 2. Room Management

### Create Room

- Membuat room baru.
- Generate kode room otomatis.
- Custom kode room.
- Kode terdiri dari 3 karakter A–Z dan 0–9.
- Memilih masa berlaku room.
- Password room opsional.
- Otomatis masuk ke workspace setelah room dibuat.

### Join Room

- Memasukkan kode room.
- Validasi ketersediaan room.
- Langsung masuk ke workspace jika valid.

### Direct Share Link

Format URL:

`domain.com/z/qwe`

Ketentuan:
- Link langsung membuka workspace room.
- Tidak perlu melewati halaman Join Room.
- Link dapat dibagikan kepada siapa saja.
- Room expired menampilkan halaman Room Expired.
- Room tidak ditemukan menampilkan halaman Not Found.

## 3. Room Expiration

Masa berlaku maksimal 7 hari.

| Satuan | Pilihan |
|---|---|
| Menit | 5, 10, 15, 30, 45 |
| Jam | 1, 2, 3, 6, 12, 24 |
| Hari | 1, 2, 3, 5, 7 |

Ketentuan:
- Countdown realtime.
- Expiration dihitung dari waktu pembuatan room.
- Room tidak dapat diakses setelah expired.
- Background worker melakukan cleanup.
- Data file dan paste ikut dihapus sesuai kebijakan retensi.

## 4. File Sharing

Fitur:
- Drag & Drop Upload.
- Multiple File Upload.
- Upload Progress.
- Download File.
- Download Progress.
- File Preview.
- Copy Download Link.
- Delete File.
- Download Counter.
- Informasi ukuran dan tipe file.
- Pengaturan maksimal ukuran file.

## 5. Paste / Text Sharing

Fitur:
- Create Paste.
- Edit Paste.
- Delete Paste.
- Syntax Highlighting.
- Monaco Editor.
- Copy All Content.
- Download Paste.
- Raw Text View.
- Markdown Preview.
- Pilihan bahasa pemrograman.
- Realtime Update.

## 6. Realtime Features

Menggunakan Go WebSocket.

Fitur realtime:
- Live User Presence.
- Live File Upload Notification.
- Live Download Counter.
- Live Paste Creation.
- Live Paste Update.
- Live Room Countdown.
- Live Activity Log.
- Sinkronisasi data antaranggota room.

### WebSocket Events

```text
room.joined
room.user_online
room.user_left
room.expiring
room.expired

file.upload_started
file.upload_completed
file.deleted
file.downloaded

paste.created
paste.updated
paste.deleted
```

## 7. UI/UX Design

Menggunakan konsep iOS Glassmorphism.

### Design System

| Komponen | Desain |
|---|---|
| Background | Soft Blue Gradient |
| Glass | Frosted Glass |
| Primary | #0A84FF |
| Accent | Mint Green |
| Typography | Inter / SF Pro |
| Icon | Lucide |
| Card Radius | 10–14px |
| Layout | Responsive |

### Halaman

1. Landing Page — Create / Join Room.
2. Create Room Form.
3. Join Room Form.
4. Room Workspace.
5. File Sharing Interface.
6. Paste Editor.
7. File Preview / Download.
8. Room Expired Page.

### Desktop

- Compact Sidebar.
- Topbar.
- Main Workspace.
- File Table.
- Paste Editor.
- Room Information Panel.
- Live Activity.

### Mobile

- Compact Header.
- Bottom Navigation.
- Card-based File List.
- Mobile Paste Editor.
- Upload / Download Status.
- Room Information.

Prinsip desain: compact, minimalis, tidak boros ruang, dan tidak menggunakan efek glass secara berlebihan.

## 8. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State Management | Zustand |
| Backend | Go |
| API | REST API |
| Realtime | Go WebSocket |
| Database | PostgreSQL |
| Cache | Redis |
| Code Editor | Monaco Editor |
| File Storage | Local / S3 Compatible |
| Web Server | Nginx |

### Backend Architecture

- Go menangani REST API dan WebSocket.
- Upload menggunakan HTTP Streaming.
- WebSocket digunakan untuk sinkronisasi event.
- Redis Pub/Sub untuk komunikasi antar-instance.
- PostgreSQL menyimpan metadata.
- File disimpan di luar public directory.
- Background Worker menangani expiration dan cleanup.

## 9. System Architecture

```text
React SPA
    |
    | HTTP API / WebSocket
    |
Go Backend
    |
    |--- REST API
    |--- WebSocket Gateway
    |--- Upload Handler
    |--- Download Handler
    |--- Room Engine
    |--- Paste Engine
    |
    |--- PostgreSQL
    |--- Redis
    |--- File Storage
    |
Background Worker
    |
    |--- Room Expiration
    |--- File Cleanup
    |--- Data Cleanup
```

## 10. Database Design

### rooms

```text
id
room_code
created_at
expires_at
status
password_hash
storage_limit
```

### files

```text
id
room_id
original_name
stored_name
mime_type
file_size
storage_path
download_count
created_at
```

### pastes

```text
id
room_id
title
content
syntax_language
created_at
updated_at
```

### room_events

```text
id
room_id
event_type
metadata
created_at
```

### download_logs

```text
id
file_id
room_id
downloaded_at
```

Catatan:
- `room_code` harus memiliki unique constraint.
- Gunakan UUID untuk primary key.
- Index pada room_code, room_id, dan expires_at.
- Gunakan transaksi database untuk operasi penting.

## 11. REST API Specification

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/rooms` | Create Room |
| GET | `/api/rooms/{code}` | Room Detail |
| POST | `/api/rooms/{code}/validate` | Validate Room |
| POST | `/api/rooms/{code}/files` | Upload File |
| GET | `/api/rooms/{code}/files` | List Files |
| GET | `/api/files/{id}/download` | Download File |
| DELETE | `/api/files/{id}` | Delete File |
| POST | `/api/rooms/{code}/pastes` | Create Paste |
| GET | `/api/rooms/{code}/pastes` | List Pastes |
| PUT | `/api/pastes/{id}` | Update Paste |
| DELETE | `/api/pastes/{id}` | Delete Paste |

## 12. Security

- Cryptographically secure random room code.
- Unique room code validation.
- Rate limiting.
- Upload MIME validation.
- Extension validation.
- Maximum file size.
- Optional room password.
- XSS protection.
- File storage isolation.
- WebSocket heartbeat.
- WebSocket reconnect.
- Room expiration validation pada setiap request.
- Download access validation.
- Protection against brute force.

**Important:** Kode 3 karakter hanya memiliki 46.656 kemungkinan kombinasi. Kode room bukan password. Untuk room privat, gunakan password atau secret tambahan.

## 13. Performance Optimization

- HTTP Streaming untuk upload dan download.
- Chunked Upload untuk file besar.
- Upload Retry dan Resume.
- Redis Cache.
- Redis Pub/Sub.
- Database Indexing.
- WebSocket Persistent Connection.
- Background Worker.
- Lazy Loading Monaco Editor.
- Nginx Reverse Proxy.
- Responsive dan lightweight frontend.

## 14. Development Roadmap

| Phase | Scope |
|---|---|
| Phase 1 | Room Engine & Expiration |
| Phase 2 | File Upload & Download |
| Phase 3 | Paste Engine & Editor |
| Phase 4 | WebSocket Realtime |
| Phase 5 | Responsive UI/UX |
| Phase 6 | Security & Performance Testing |

## 15. Definition of Done

- [ ] Tidak ada login dan registrasi.
- [ ] Create Room berfungsi.
- [ ] Join Room berfungsi.
- [ ] Custom dan Random Room Code.
- [ ] Direct Link `/z/{code}` berfungsi.
- [ ] Room expiration maksimal 7 hari.
- [ ] File upload dan download berfungsi.
- [ ] Paste create, edit, delete, dan copy berfungsi.
- [ ] Realtime synchronization berfungsi.
- [ ] Live user presence berfungsi.
- [ ] Automatic cleanup berfungsi.
- [ ] Desktop dan mobile responsive.
- [ ] Security testing selesai.

---

**Project Principle**

Room adalah pusat seluruh aktivitas.

DropRoom harus tetap sederhana: tanpa akun, tanpa registrasi, tanpa dashboard pengguna yang kompleks. Pengguna cukup membuat room atau membuka link untuk mulai berbagi file dan teks secara realtime.