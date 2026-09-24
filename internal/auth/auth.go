package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const sessionCookieName = "teslamap_session"

type AuthManager struct {
	adminPassword string
	secretKey     []byte
}

func NewAuthManager(adminPassword, sessionSecret string) *AuthManager {
	return &AuthManager{
		adminPassword: adminPassword,
		secretKey:     []byte(sessionSecret),
	}
}

func (a *AuthManager) CheckPassword(password string) bool {
	return subtleConstantTimeCompare(a.adminPassword, password)
}

func (a *AuthManager) SetSessionCookie(w http.ResponseWriter) {
	exp := time.Now().Add(7 * 24 * time.Hour).Unix()
	payload := strconv.FormatInt(exp, 10)
	mac := a.generateMAC(payload)
	val := payload + "." + mac

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    val,
		Path:     "/",
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func (a *AuthManager) ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
	})
}

func (a *AuthManager) IsAuthenticated(r *http.Request) bool {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return false
	}

	parts := strings.Split(cookie.Value, ".")
	if len(parts) != 2 {
		return false
	}

	payload := parts[0]
	sig := parts[1]

	expectedMAC := a.generateMAC(payload)
	if !subtleConstantTimeCompare(sig, expectedMAC) {
		return false
	}

	exp, err := strconv.ParseInt(payload, 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return false
	}

	return true
}

func (a *AuthManager) generateMAC(message string) string {
	mac := hmac.New(sha256.New, a.secretKey)
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

func subtleConstantTimeCompare(a, b string) bool {
	return hmac.Equal([]byte(a), []byte(b))
}
