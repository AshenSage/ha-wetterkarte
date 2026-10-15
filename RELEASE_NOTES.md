Erstes stabiles Release der mobilen Wetterkarte für Home Assistant.

- Kompakte Anzeige des aktuellen Wetters, der Temperatur und des Windes.
- Reiter für eine stündliche Vorhersage und die nächsten sieben Tage.
- Gut lesbare Tageszeilen mit Min-/Max-Temperatur und Regenmenge.
- Aufklappbare Quelleninfos und sichtbarer Status bei Datenlücken.
- Bestehende Wetterkonsens-Berechnung und Aktualitätsgrenzen übernommen.
- HACS-Dashboard-Paket ohne zusätzliche Frontend-Abhängigkeiten.

Die vorhandenen Wetter- und Prognose-Sensoren bleiben erforderlich. Beispiele und die Anleitung stehen in der README.

Lokal geprüft: Handybreiten ab 320 Pixel, Reiter, Quellenansicht, Datenupdates, Verbindungsabbruch/Wiederverbindung, fehlende und veraltete Daten sowie die Wetterberechnung inklusive Einheiten und Zeitumstellung. Der Test erfolgte mit Beispieldaten, nicht auf einem laufenden Home-Assistant-System.
