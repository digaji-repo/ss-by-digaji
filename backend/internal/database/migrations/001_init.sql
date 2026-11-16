-- DropRoom Initial MySQL / MariaDB Schema

CREATE TABLE IF NOT EXISTS rooms (
    id CHAR(36) PRIMARY KEY,
    room_code VARCHAR(3) NOT NULL UNIQUE,
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    password_hash TEXT NULL,
    storage_limit BIGINT NOT NULL,
    INDEX idx_rooms_room_code (room_code),
    INDEX idx_rooms_expires_at (expires_at),
    INDEX idx_rooms_status_expires_at (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS files (
    id CHAR(36) PRIMARY KEY,
    room_id CHAR(36) NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    download_count INT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    INDEX idx_files_room_id (room_id),
    CONSTRAINT fk_files_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pastes (
    id CHAR(36) PRIMARY KEY,
    room_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled Paste',
    content LONGTEXT NOT NULL,
    syntax_language VARCHAR(64) NOT NULL DEFAULT 'plaintext',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    INDEX idx_pastes_room_id (room_id),
    CONSTRAINT fk_pastes_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_events (
    id CHAR(36) PRIMARY KEY,
    room_id CHAR(36) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    metadata LONGTEXT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    INDEX idx_room_events_room_id (room_id),
    INDEX idx_room_events_created_at (created_at),
    CONSTRAINT fk_room_events_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS download_logs (
    id CHAR(36) PRIMARY KEY,
    file_id CHAR(36) NOT NULL,
    room_id CHAR(36) NOT NULL,
    downloaded_at DATETIME(6) NOT NULL,
    INDEX idx_download_logs_room_id (room_id),
    INDEX idx_download_logs_file_id (file_id),
    CONSTRAINT fk_download_logs_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    CONSTRAINT fk_download_logs_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
