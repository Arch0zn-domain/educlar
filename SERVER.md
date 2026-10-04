# Server local pe Windows

Din folderul proiectului, dublu click pe **START-SERVER.cmd**. Serverul pornește în fundal, verifică pagina principală și deschide `http://127.0.0.1:3000/`. Fereastra lansatorului poate fi închisă după pornire. Procesul rămâne pornit până la oprire sau repornirea calculatorului.

Este necesar Node.js 22 sau mai nou și instalarea inițială a dependențelor cu `npm ci`.

Comenzi PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\server.ps1 start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\server.ps1 status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\server.ps1 stop
```

`start` verifică serverul existent și nu pornește o copie dacă acesta răspunde. `status` arată portul, PID-ul, comanda procesului și rezultatul HTTP. Codurile de ieșire sunt 0 pentru server sănătos, 1 pentru server oprit/eroare, 2 pentru port ocupat de alt proces și 3 pentru serverul proiectului care nu răspunde corect. Adăugați `-Json` pentru rezultat structurat.

Logurile fiecărei porniri și identificarea procesului sunt în `.logs/`. În caz de eroare, `status` arată căile logurilor. Un server pornit anterior cu `npm run dev` poate răspunde deja; lansatorul îl recunoaște, dar independența acelui proces de terminalul său nu este garantată. Pentru a trece la lansator, opriți serverul anterior și rulați `start`.

`stop` verifică înainte de oprire calea exactă a proiectului, comanda și momentul creării procesului. Nu oprește alte servere care ocupă portul. Oprirea de fundal pe Windows închide procesul Node; pentru oprire prin Ctrl+C folosiți `npm run dev` într-un terminal și păstrați terminalul deschis. Nu se șterg baza de date, cache-ul sau logurile.

Modul implicit este `development`, pentru a reflecta modificările de cod. Pentru un build optimizat:

```powershell
npm run build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\server.ps1 start -Mode production
```

Pentru un test separat, folosiți atât alt port, cât și alt director de date. Nu rulați două instanțe Next dev în același folder. Un server production separat poate fi folosit alături de cel dev după build:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\server.ps1 start -Mode production -Port 3101 -DataDirectory .data\server-test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\server.ps1 status -Port 3101
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\server.ps1 stop -Port 3101
```

Pornirea setează `APP_MODE=local`, `BETTER_AUTH_URL` la adresa portului ales și `DATA_DIR` la directorul de date ales. Serverul este accesibil numai pe calculatorul local. Nu se instalează automat un serviciu Windows și nu pornește automat după restart.
