# Braess Paradoksu Trafik Simülasyonu

Bu proje, OpenStreetMap tabanlı bir arayüz üzerinde başlangıç/varış seçimi yaparak Braess paradoksu senaryolarını karşılaştıran profesyonel bir web uygulamasıdır.

## Teknoloji

- `web`: React + TypeScript + Vite + Leaflet
- `api`: Node.js + Express + TypeScript
- Çalıştırma: Docker Compose

## Hızlı Başlangıç

```bash
docker-compose up --build
```

Uygulama:

- Arayüz: `http://localhost:5173`
- API: `http://localhost:4000/health`

## Özellikler

- OpenStreetMap üzerinde tıklayarak başlangıç/varış seçimi
- Sol panelden enlem/boylam girişi
- Senaryo karşılaştırması:
  - Mevcut ağ
  - Yeni yol ekle
  - Yol kapat
  - Akıllı ışıklandırma
  - Acil araç önceliği
- “Braess Paradoksu: VAR/YOK” analizi
- En iyi çözüm önerisi

