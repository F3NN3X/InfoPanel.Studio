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
