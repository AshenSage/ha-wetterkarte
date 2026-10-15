# Wetterkarte für Home Assistant

Mobile Wetterkarte mit einer kompakten aktuellen Wetteranzeige, Reitern für **Stunden** und **7 Tage** sowie aufklappbaren Quelleninfos. Die Farben folgen deinem bestehenden Home-Assistant-Theme.

## Voraussetzungen

- Home Assistant ab 2026.10.0.
- Vorhandene `weather.*`-Entitäten für das aktuelle Wetter.
- Zwei vorhandene Prognose-Sensoren mit den unten beschriebenen Attributen.

Die Karte ist eine **Dashboard-Karte**. Sie erstellt keine Backend-Sensoren und ruft keine externen Wetterdienste ab. Für Reiter und Darstellung sind keine weiteren HACS-Karten oder Helfer nötig.

## Installation mit HACS

1. HACS öffnen → Menü mit den drei Punkten → **Benutzerdefinierte Repositories**.
2. Repository `https://github.com/AshenSage/ha-wetterkarte` hinzufügen.
3. Als Typ **Dashboard** auswählen.
4. **Wetterkarte** herunterladen. Normale Releases verwenden; Beta-Versionen sind nicht nötig.
5. Home Assistant im Browser bzw. die App vollständig neu laden.
6. Eine manuelle Dashboard-Karte mit der YAML unten erstellen.

Falls HACS die Ressource nicht automatisch eingetragen hat, unter **Einstellungen → Dashboards → Ressourcen** hinzufügen:

```yaml
url: /hacsfiles/ha-wetterkarte/ha-wetterkarte.js
type: module
```

In der Oberfläche heisst der Ressourcentyp **JavaScript-Modul**. Falls das Ressourcen-Menü fehlt, den erweiterten Modus im eigenen Benutzerprofil aktivieren.

### Wechsel von der manuellen Installation

Falls vorher `/local/arandjelovac-weather-card.js` eingebunden war, diesen bisherigen Ressourceneintrag durch den oben genannten HACS-Eintrag ersetzen. Die Datei kann lokal liegen bleiben, darf aber nicht zusätzlich geladen werden: Beide Dateien registrieren dieselbe Karte. Sonst könnte weiterhin die alte Fassung angezeigt werden.

Der Kartentyp bleibt **`custom:arandjelovac-weather-card`**, damit bestehende YAML weiter funktioniert. Die installierte Datei heisst für HACS **`ha-wetterkarte.js`**.

## Karten-YAML

```yaml
type: custom:arandjelovac-weather-card
title: Aranđelovac
default_tab: days
daily_entity: sensor.arandjelovac_wetter_konsens
hourly_entity: sensor.arandjelovac_wetter_stunden
weather_entities:
  - weather.arandjelovac
  - weather.forecast_home
  - weather.tomorrow_io_arandjelovac_daily
grid_options:
  columns: 12
  rows: auto
```

Diese YAML kommt in den Karteneditor des Dashboards. Sie wird nicht in `configuration.yaml` eingefügt. Das gleiche Beispiel liegt unter [`examples/arandjelovac.yaml`](examples/arandjelovac.yaml).

| Einstellung | Bedeutung |
| --- | --- |
| `title` | Angezeigter Ortsname; frei wählbar. |
| `default_tab` | `days` für sieben Tage, `hours` für Stunden als Startansicht. |
| `daily_entity` | Prognose-Sensor mit Tagesdaten. |
| `hourly_entity` | Prognose-Sensor mit Stundendaten. |
| `weather_entities` | Wetterquellen für aktuelle Temperatur, Wind und Wetterlage. |

## Bedienung und Darstellung

- Das aktuelle Wetter bleibt oberhalb der Reiter sichtbar.
- Die Stundenleiste zeigt Jetzt und bis zu 24 Stunden; horizontal wischen für weitere Stunden.
- Sieben Tage stehen als einzelne Zeilen mit Min-/Max-Temperatur untereinander.
- Explizit 0 mm Regen wird ausgeblendet. Fehlende Mengen erscheinen als `Regen —`, sehr kleine positive Mengen unter 0,05 mm als `<0,1 mm`.
- **Quellen** und das Informationssymbol öffnen den Datenstatus mit HA-Meldungen und Prognose-Abfragen. Dort lassen sich auch die Sensordetails öffnen.
- Ein gewählter Reiter bleibt bei Datenupdates erhalten. Nach einem vollständigen Neuladen gilt wieder `default_tab`.
- Die Darstellung folgt dem HA-Theme; kein Themewechsel nötig.

## Benötigtes Datenformat

Die Karte wurde für die vorhandenen Aranđelovac-Wetterkonsens-Sensoren erstellt. Für andere Orte müssen die jeweiligen Sensoren die gleiche Struktur bereitstellen.

### Tages-Sensor

Attribute:

```yaml
last_update: '2026-10-15T07:38:00+02:00'
last_fetch_ok: true
source_count: 3
forecast:
  - date: '2026-10-15'
    condition: cloudy
    temperature: 15
    templow: 8
    precipitation: 0.2
```

### Stunden-Sensor

```yaml
last_update: '2026-10-15T07:38:00+02:00'
last_fetch_ok: true
source_count: 2
forecast:
  - datetime: '2026-10-15T08:00:00+02:00'
    condition: partlycloudy
    temperature: 9
    precipitation: 0
```

Diese Daten sind Formatbeispiele, keine aktuellen Wetterwerte. Prognose-Temperaturen müssen bereits in °C und Niederschlag in mm vorliegen. Zeitangaben benötigen einen Zeitzonenoffset oder `Z`. Das Datum der Tagesdaten entspricht dem lokalen HA-Kalendertag. Für `condition` werden die normalen HA-Wetterzustände verwendet.

Eine Prognose ist auch nutzbar, wenn der Sensorzustand `unknown` lautet, solange gültige Prognose-Attribute vorhanden sind. `unavailable` gilt als nicht verfügbar. Die angezeigten Zielzahlen der Prognosequellen entsprechen der vorhandenen Konfiguration: zwei Stundenquellen und drei Tagesquellen.

## Berechnung und Aktualität

- Aktuelle Temperatur und Wind: Median der gültigen Quellen; Einheiten werden für aktuelle Wetterdaten nach °C bzw. km/h umgerechnet.
- Aktuelle Wetterquellen: maximal drei Stunden seit `last_reported`.
- Prognosen: maximal zwei Stunden seit `last_update`.
- Bei widersprüchlichen Wetterlagen haben Regen, Gewitter und andere warnende Wetterarten wie in der bisherigen YAML Vorrang. Dies ersetzt keine amtliche Wetterwarnung.
- Die **HA-Meldung** zeigt den Eingang einer Meldung in Home Assistant und ist kein garantierter Messzeitpunkt des Wetteranbieters.
- Die Berechnung läuft über die bestehende authentifizierte HA-Verbindung. Änderungen sowie die minütliche Zeitaktualisierung aktualisieren die Anzeige.
- Bei Verbindungsabbruch erscheint ein Statushinweis; gespeicherte Werte werden spätestens nach den obigen Fristen ausgeblendet.

## Updates

Neue stabile Releases lassen sich über HACS aktualisieren. Danach den Browser bzw. die App neu laden. Die bestehende Ressourcen-URL und Karten-YAML können gleich bleiben.

## Manuelle Installation

`dist/ha-wetterkarte.js` nach `/config/www/ha-wetterkarte.js` kopieren und als JavaScript-Modul `/local/ha-wetterkarte.js?v=1.0.0` registrieren. Danach Home Assistant im Browser bzw. die App vollständig neu laden.

## Veröffentlichung

Die fertige Datei liegt in `dist/ha-wetterkarte.js`; es gibt keine Build-Abhängigkeiten.

```bash
npm run check
```

Für eine neue Version `package.json`, `CHANGELOG.md` und `RELEASE_NOTES.md` aktualisieren und die geänderte Karte auf `main` committen. Der Release-Workflow prüft das Paket und veröffentlicht eine neue stabile Versionsnummer aus `package.json`, sofern dieses Release noch nicht existiert. Beta- und Vorab-Versionsnummern werden abgewiesen. Der Workflow kann zusätzlich manuell gestartet werden.

## Prüfung

Die erste Version wurde lokal mit Beispieldaten geprüft: Breiten ab 320 Pixel, Reiter, Tastaturbedienung, Quelleninfos, Datenupdates, fehlende/veraltete Daten, Wiederverbindung sowie Wetterberechnung inklusive Einheiten und Zeitumstellung. Auf einem laufenden Home-Assistant-System wurde sie noch nicht ausgeführt.
