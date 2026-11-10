@echo off
rem Richtet auf DIESEM PC (Post-PC) den Abruf der E-Mails aus dem Buero-Postfach ein.
rem Bitte unter dem Windows-Benutzer ausfuehren, unter dem auch das automatische Sortieren laeuft.
rem Die Zugangsdaten bleiben verschluesselt auf diesem PC (%APPDATA%\Posteingang).
"%~dp0Posteingang-sortieren.exe" --mail-einrichten
