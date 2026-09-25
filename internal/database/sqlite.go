package database

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type SharedLink struct {
	ID              int64      `json:"id"`
	Token           string     `json:"token"`
	Label           string     `json:"label"`
	CreatedAt       time.Time  `json:"created_at"`
	StartsAt        *time.Time `json:"starts_at"`
	ExpiresAt       *time.Time `json:"expires_at"`
	ExpireOnArrival bool       `json:"expire_on_arrival"`
	ShowSpeed       bool       `json:"show_speed"`
	ShowBattery     bool       `json:"show_battery"`
	IsActive        bool       `json:"is_active"`
	ViewCount       int64      `json:"view_count"`
	LastTelemetry   string     `json:"last_telemetry,omitempty"`
}

func (l *SharedLink) IsPending() bool {
	return l.StartsAt != nil && time.Now().UTC().Before(*l.StartsAt)
}

func (l *SharedLink) IsExpired() bool {
	if !l.IsActive {
		return true
	}
	if l.ExpiresAt != nil && time.Now().UTC().After(*l.ExpiresAt) {
		return true
	}
	return false
}

func (l *SharedLink) IsAvailable() bool {
	return l.IsActive && !l.IsPending() && !l.IsExpired()
}

func (l *SharedLink) IsDefinitelyClosed(graceHours int) bool {
	if !l.IsExpired() {
		return false
	}
	if graceHours <= 0 {
		graceHours = 2
	}
	refTime := l.CreatedAt
	if l.ExpiresAt != nil {
		refTime = *l.ExpiresAt
	}
	return time.Now().UTC().After(refTime.Add(time.Duration(graceHours) * time.Hour))
}

type SafeZone struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
	RadiusMeters float64   `json:"radius_meters"`
	CreatedAt    time.Time `json:"created_at"`
}

type DB struct {
	conn *sql.DB
}

func Open(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create db dir error: %w", err)
	}

	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite error: %w", err)
	}

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("migration error: %w", err)
	}

	return db, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS shared_links (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		token TEXT UNIQUE NOT NULL,
		label TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		starts_at DATETIME,
		expires_at DATETIME,
		expire_on_arrival BOOLEAN DEFAULT 0,
		show_speed BOOLEAN DEFAULT 1,
		show_battery BOOLEAN DEFAULT 1,
		is_active BOOLEAN DEFAULT 1,
		view_count INTEGER DEFAULT 0
	);

	CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(token);

	CREATE TABLE IF NOT EXISTS safe_zones (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		latitude REAL NOT NULL,
		longitude REAL NOT NULL,
		radius_meters REAL NOT NULL,
		created_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	`
	if _, err := db.conn.Exec(schema); err != nil {
		return err
	}

	// Add starts_at and last_telemetry to existing databases (ignore if column exists)
	_, _ = db.conn.Exec("ALTER TABLE shared_links ADD COLUMN starts_at DATETIME;")
	_, _ = db.conn.Exec("ALTER TABLE shared_links ADD COLUMN last_telemetry TEXT;")
	return nil
}

func GenerateToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (db *DB) CreateSharedLink(label string, startsAt, expiresAt *time.Time, expireOnArrival, showSpeed, showBattery bool) (*SharedLink, error) {
	token, err := GenerateToken(12) // 24 hex characters
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()

	query := `
	INSERT INTO shared_links (token, label, created_at, starts_at, expires_at, expire_on_arrival, show_speed, show_battery, is_active, view_count)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
	`
	res, err := db.conn.Exec(query, token, label, now, startsAt, expiresAt, expireOnArrival, showSpeed, showBattery)
	if err != nil {
		return nil, err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &SharedLink{
		ID:              id,
		Token:           token,
		Label:           label,
		CreatedAt:       now,
		StartsAt:        startsAt,
		ExpiresAt:       expiresAt,
		ExpireOnArrival: expireOnArrival,
		ShowSpeed:       showSpeed,
		ShowBattery:     showBattery,
		IsActive:        true,
		ViewCount:       0,
	}, nil
}

func (db *DB) GetSharedLinkByToken(token string) (*SharedLink, error) {
	query := `
	SELECT id, token, label, created_at, starts_at, expires_at, expire_on_arrival, show_speed, show_battery, is_active, view_count, COALESCE(last_telemetry, '')
	FROM shared_links
	WHERE token = ?
	`
	row := db.conn.QueryRow(query, token)

	var l SharedLink
	var startsAt, expiresAt sql.NullTime
	err := row.Scan(&l.ID, &l.Token, &l.Label, &l.CreatedAt, &startsAt, &expiresAt, &l.ExpireOnArrival, &l.ShowSpeed, &l.ShowBattery, &l.IsActive, &l.ViewCount, &l.LastTelemetry)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if startsAt.Valid {
		l.StartsAt = &startsAt.Time
	}
	if expiresAt.Valid {
		l.ExpiresAt = &expiresAt.Time
	}

	return &l, nil
}

func (db *DB) SaveLinkLastTelemetry(token string, telemetryJSON string) error {
	_, err := db.conn.Exec("UPDATE shared_links SET last_telemetry = ? WHERE token = ?", telemetryJSON, token)
	return err
}

func (db *DB) IncrementLinkViewCount(token string) error {
	_, err := db.conn.Exec("UPDATE shared_links SET view_count = view_count + 1 WHERE token = ?", token)
	return err
}

func (db *DB) RevokeLink(id int64) error {
	now := time.Now().UTC()
	_, err := db.conn.Exec("UPDATE shared_links SET is_active = 0, expires_at = COALESCE(expires_at, ?) WHERE id = ?", now, id)
	return err
}

func (db *DB) HasActiveSharedLinks() (bool, error) {
	now := time.Now().UTC()
	var count int
	err := db.conn.QueryRow(`
		SELECT COUNT(*) FROM shared_links
		WHERE is_active = 1
		  AND (starts_at IS NULL OR starts_at <= ?)
		  AND (expires_at IS NULL OR expires_at > ?)
	`, now, now).Scan(&count)
	return count > 0, err
}

func (db *DB) ListActiveExpireOnArrivalLinks() ([]SharedLink, error) {
	query := `
	SELECT id, token, label, created_at, starts_at, expires_at, expire_on_arrival, show_speed, show_battery, is_active, view_count, COALESCE(last_telemetry, '')
	FROM shared_links
	WHERE is_active = 1 AND expire_on_arrival = 1
	`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var links []SharedLink
	for rows.Next() {
		var l SharedLink
		var startsAt, expiresAt sql.NullTime
		if err := rows.Scan(&l.ID, &l.Token, &l.Label, &l.CreatedAt, &startsAt, &expiresAt, &l.ExpireOnArrival, &l.ShowSpeed, &l.ShowBattery, &l.IsActive, &l.ViewCount, &l.LastTelemetry); err != nil {
			return nil, err
		}
		if startsAt.Valid {
			l.StartsAt = &startsAt.Time
		}
		if expiresAt.Valid {
			l.ExpiresAt = &expiresAt.Time
		}
		links = append(links, l)
	}
	return links, nil
}

func (db *DB) DeleteLink(id int64) error {
	_, err := db.conn.Exec("DELETE FROM shared_links WHERE id = ?", id)
	return err
}

func (db *DB) ListSharedLinks() ([]SharedLink, error) {
	query := `
	SELECT id, token, label, created_at, starts_at, expires_at, expire_on_arrival, show_speed, show_battery, is_active, view_count, COALESCE(last_telemetry, '')
	FROM shared_links
	ORDER BY created_at DESC
	`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var links []SharedLink
	for rows.Next() {
		var l SharedLink
		var startsAt, expiresAt sql.NullTime
		if err := rows.Scan(&l.ID, &l.Token, &l.Label, &l.CreatedAt, &startsAt, &expiresAt, &l.ExpireOnArrival, &l.ShowSpeed, &l.ShowBattery, &l.IsActive, &l.ViewCount, &l.LastTelemetry); err != nil {
			return nil, err
		}
		if startsAt.Valid {
			l.StartsAt = &startsAt.Time
		}
		if expiresAt.Valid {
			l.ExpiresAt = &expiresAt.Time
		}
		links = append(links, l)
	}

	return links, rows.Err()
}

// ExpireOnArrivalLinks deactivates all active links that had expire_on_arrival = true
func (db *DB) ExpireOnArrivalLinks() error {
	_, err := db.conn.Exec("UPDATE shared_links SET is_active = 0 WHERE is_active = 1 AND expire_on_arrival = 1")
	return err
}

func (db *DB) ListSafeZones() ([]SafeZone, error) {
	rows, err := db.conn.Query("SELECT id, name, latitude, longitude, radius_meters, created_at FROM safe_zones ORDER BY id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var zones []SafeZone
	for rows.Next() {
		var z SafeZone
		if err := rows.Scan(&z.ID, &z.Name, &z.Latitude, &z.Longitude, &z.RadiusMeters, &z.CreatedAt); err != nil {
			return nil, err
		}
		zones = append(zones, z)
	}
	return zones, rows.Err()
}

func (db *DB) CreateSafeZone(name string, lat, lon, radius float64) (*SafeZone, error) {
	now := time.Now().UTC()
	res, err := db.conn.Exec("INSERT INTO safe_zones (name, latitude, longitude, radius_meters, created_at) VALUES (?, ?, ?, ?, ?)",
		name, lat, lon, radius, now)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &SafeZone{
		ID:           id,
		Name:         name,
		Latitude:     lat,
		Longitude:    lon,
		RadiusMeters: radius,
		CreatedAt:    now,
	}, nil
}

func (db *DB) DeleteSafeZone(id int64) error {
	_, err := db.conn.Exec("DELETE FROM safe_zones WHERE id = ?", id)
	return err
}

func (db *DB) GetSetting(key, defaultValue string) (string, error) {
	var val string
	err := db.conn.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val)
	if err == sql.ErrNoRows {
		return defaultValue, nil
	}
	if err != nil {
		return defaultValue, err
	}
	return val, nil
}

func (db *DB) SetSetting(key, value string) error {
	_, err := db.conn.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value)
	return err
}

func (db *DB) GetBoolSetting(key string, defaultValue bool) bool {
	defaultStr := "0"
	if defaultValue {
		defaultStr = "1"
	}
	val, err := db.GetSetting(key, defaultStr)
	if err != nil {
		return defaultValue
	}
	return val == "1" || val == "true"
}

func (db *DB) SetBoolSetting(key string, value bool) error {
	valStr := "0"
	if value {
		valStr = "1"
	}
	return db.SetSetting(key, valStr)
}
