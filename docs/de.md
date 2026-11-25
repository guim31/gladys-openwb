# openWB

Die Integration bringt eine **openWB 2.x** Wallbox lokal in Gladys, über den MQTT-Broker, der auf der openWB läuft.
Die Integration folgt jedem Ladepunkt live (angesteckt, lädt, Leistung, Energie), den Zählern für Netz, PV und Batterie, die
die openWB kennt, löst Szenen aus, wenn ein Fahrzeug angesteckt wird oder ein Ladevorgang endet, und kann den
Lademodus und den Strom für Sofortladen ändern.

> Ohne die Hardware entwickelt, anhand des Quellcodes von openWB 2 (openWB/core) und getestet gegen einen echten
> Mosquitto-Broker, der ihre Topics abspielt: Rückmeldungen sind willkommen.

## Voraussetzungen

- Eine openWB mit der Software **2.x** (Serie 2, Pro oder jede auf 2.x aktualisierte openWB). Die Software 1.9
  nutzt andere Topics und wird nicht unterstützt.
- Gladys 5.1 oder neuer, im selben Netz wie die openWB.
- Zugriff auf den Broker der openWB:
  - **Port 1883 (unverschlüsselt)**: aktiviere in der openWB unter _System → Sicherheit_ die Option
    _Unverschlüsselten Zugang erlauben_;
  - oder **Port 8883 mit TLS**, standardmäßig offen: setze in der Integration den Haken bei _TLS_. Die openWB nutzt
    ein selbstsigniertes Zertifikat, das die Integration akzeptiert.
- Ist die Benutzerverwaltung der openWB aktiv: Port 8883 mit TLS (die openWB schließt dann Port 1883), ein
  openWB-Benutzer und sein Passwort. Um Modi zu ändern, braucht dieser Benutzer Schreibrechte auf seine Ladepunkte.

## Konfiguration

| Feld                       | Was du eingibst                                                      |
| -------------------------- | -------------------------------------------------------------------- |
| Adresse der openWB         | IP-Adresse oder Hostname der openWB, z. B. `192.168.1.30`            |
| MQTT-Port                  | `1883` (unverschlüsselt) oder `8883` (TLS)                           |
| TLS                        | Für Port 8883 aktiviert                                              |
| MQTT-Benutzer und Passwort | Nur mit der Benutzerverwaltung der openWB                            |
| Steuerung erlauben         | Standardmäßig aus: erlaubt Gladys, Modus und Strom zu ändern         |
| Sprache der Funktionsnamen | Einmal verwendet, beim Anlegen der Geräte; standardmäßig Französisch |

Nutze dann **Verbindung testen**: Der Test listet die Ladepunkte auf, die die openWB meldet. Die Geräte erscheinen im
Tab **Entdecken** der Integration: füge die gewünschten hinzu.

**Stop geht immer**, auch bei ausgeschalteter Steuerung: einen Ladevorgang zu stoppen ist nie gefährlich. Die
anderen Modi und der Strom brauchen _Steuerung erlauben_.

## Die Geräte

### Ladepunkt

Ein Gerät pro Ladepunkt der openWB, benannt wie in der openWB:

- **Lademodus** (steuerbar): Sofortladen, PV-Laden, Eco-Laden, Zielladen, Stop. _Min + PV_ der openWB ist PV-Laden
  mit einem Mindeststrom im Lade-Profil;
- **Fahrzeug angesteckt**, **Ladezustand** (lädt, angesteckt, Pause vom Auto, wartet auf die openWB, frei);
- **Ladeleistung** (kW), **Ladestrom** (A, höchste Phase);
- **Strom für Sofortladen** (steuerbar, 6 bis 32 A): der Strom des Sofortladens;
- **Energie des Ladevorgangs** (kWh): die Energie des laufenden Ladevorgangs, bleibt nach dem Abstecken erhalten;
- **Zähler der Wallbox** (kWh): der Zähler des Ladepunkts, nutzbar im Energiemodul von Gladys;
- **Fahrzeugbatterie** (%), nur wenn die openWB sie kennt (SoC-Modul des Fahrzeugs oder eine Wallbox, die sie
  ausliest).

### openWB-Standort

Wird angelegt, wenn die openWB etwas davon misst:

- **Netz** (W, Bezug positiv, Einspeisung negativ), **Netzbezug** und **Netzeinspeisung** (Zähler in kWh);
- **Hausverbrauch** (W);
- **Solarproduktion** (W) und **Solarertrag** (Zähler in kWh);
- **Hausbatterie** (%), **Batterie lädt** und **Batterie entlädt** (W).

## Dashboard-Widget

Das Widget **openWB** zeigt Solar, Haus und Netz als Kacheln, eine Zeile pro Ladepunkt (Zustand, Leistung,
Batteriestand, Modus) und die Hausbatterie, dazu Modus-Tasten für einen Ladepunkt (in den Widget-Einstellungen
gewählt, sonst der erste): Sofortladen, PV-Laden, Eco-Laden und Stop bei erlaubter Steuerung, sonst nur Stop. Der
aktuelle Modus trägt einen Haken. Zwei Einstellungen blenden Kacheln und Tasten aus.

## Szenen-Auslöser

| Auslöser            | Wann                                                                  | Variablen                              |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| Fahrzeug angesteckt | Ein Fahrzeug wird an einem Ladepunkt angesteckt                       | Ladepunkt, Fahrzeug                    |
| Fahrzeug abgesteckt | Ein Fahrzeug wird abgesteckt                                          | Ladepunkt, Fahrzeug, Energie (kWh)     |
| Laden gestartet     | Ein Ladevorgang beginnt (eine kurze Pause ist kein neuer Ladevorgang) | Ladepunkt, Fahrzeug                    |
| Laden beendet       | Ein Ladevorgang steht seit 10 Minuten still, oder das Fahrzeug ist ab | Ladepunkt, Fahrzeug, Energie, Batterie |

Jeder Auslöser lässt sich auf einen Ladepunkt beschränken, _Laden gestartet_ auch auf einen Modus. Das Fahrzeug ist
das, das die openWB dem Ladepunkt zugeordnet hat. Die Batterie ist -1, wenn die openWB sie nicht kennt.

## Szenen-Aktionen

- **Lademodus einstellen** an einem Ladepunkt. Stop geht immer, die anderen Modi brauchen die Steuerung.
- **Strom für Sofortladen einstellen** (6 bis 32 A), bei erlaubter Steuerung.

Die Integration wartet, bis die openWB die Änderung übernommen hat (höchstens 15 Sekunden); sonst schlägt die
Aktion mit einer Meldung fehl.

## Szenen-Beispiele

- Um 22 Uhr auf Sofortladen schalten (Nachttarif) und um 6 Uhr zurück auf PV-Laden.
- Wenn ein Ladevorgang beendet ist, eine Nachricht mit der geladenen Energie senden.
- Wenn der Netzpreis hoch ist (andere Integration), den Ladepunkt auf Stop setzen.

## Fehlerbehebung

- **„Der MQTT-Broker der openWB antwortet nicht“**: prüfe die Adresse und ob der unverschlüsselte Zugang in der
  openWB für Port 1883 erlaubt ist (oder nutze 8883 mit TLS).
- **„hat Benutzername oder Passwort abgelehnt“**: die Benutzerverwaltung der openWB ist aktiv; nutze Port 8883 mit
  TLS und einen openWB-Benutzer.
- **„keine Daten von openWB 2.x“**: der Broker antwortet, veröffentlicht aber kein Topic `openWB/...`. Ist es eine
  openWB 2? Die Software 1.9 wird nicht unterstützt.
- **„openWB hat die Änderung nicht übernommen“**: die Regelung der openWB läuft nicht, oder der MQTT-Benutzer darf
  auf diesen Ladepunkt nicht schreiben.

## Grenzen

- Nur openWB 2.x, über ihren MQTT-Broker; keine Cloud.
- Modus oder Strom zu ändern bearbeitet das auf dem Ladepunkt aktive **Lade-Profil**, wie die simpleAPI der openWB.
  Teilen sich andere Ladepunkte oder Fahrzeuge dieses Profil, übernimmt die openWB die Änderung auch für sie (außer
  die „temporären Lade-Profile“ sind aktiv).
- Zielladen-Pläne, zeitgesteuertes Laden und Batterie-Einstellungen werden nicht von Gladys aus geändert.
- Ohne die Hardware entwickelt: Rückmeldungen im Forum sind willkommen.
