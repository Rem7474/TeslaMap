# Multi-stage build for TeslaMap
FROM golang:alpine AS builder

WORKDIR /src

RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build statically linked binary without CGO
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/teslamap ./cmd/teslamap

# Final lightweight production image
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/teslamap /app/teslamap

# Storage directory for SQLite database
VOLUME ["/data"]

ENV PORT=8080
ENV DATABASE_PATH=/data/teslamap.db
ENV MQTT_BROKER=tcp://mosquitto:1883
ENV TESLAMATE_CAR_ID=1

EXPOSE 8080

ENTRYPOINT ["/app/teslamap"]
