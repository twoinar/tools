@echo off
rem Export Nebenakte (43 NotAktVV): fragt nach Vorgangs- oder UVZ-Nummer, Export nach Y:\Nebenakten-Export.
chcp 65001 >nul
"%~dp0Posteingang-sortieren.exe" --nebenakte %*
