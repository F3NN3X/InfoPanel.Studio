; Before an update: the files earlier versions shipped and this one doesn't. NSIS only overwrites, so
; an update would keep the bundled Node (node\, about 90 MB, gone since 1.3.0-beta.19) and old app\
; files (the Node server, and hashed web chunks of every earlier version). app\ holds only what the
; installer writes; settings and dashboard data live elsewhere. Only over an existing install.
!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "$INSTDIR\infopanel-studio.exe"
    RMDir /r "$INSTDIR\node"
    RMDir /r "$INSTDIR\app"
  ${EndIf}
!macroend

; Removes the coding agent hooks before uninstalling, so none is left pointing at a deleted
; ips-agent.exe (the ones from before ips-agent, which ran node.exe, go too). Only when the app
; installed them (it keeps the marker file while they are on).
!macro NSIS_HOOK_PREUNINSTALL
  ${If} ${FileExists} "$APPDATA\dev.f3nn3x.infopanel-studio\agents-installed"
    nsExec::Exec '"$INSTDIR\ips-agent.exe" remove-hooks'
    Pop $0
    Delete "$APPDATA\dev.f3nn3x.infopanel-studio\agents-installed"
  ${EndIf}
!macroend

; After uninstalling: the folders a version from before 1.3.0-beta.19 left behind.
!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\app"
!macroend
