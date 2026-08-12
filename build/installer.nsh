; Default the assisted installer to the existing local toolbox directory.
; The user can still choose another directory in the installer UI.
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "E:\toolkit\personal-toolbox"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "E:\toolkit\personal-toolbox"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "E:\toolkit\personal-toolbox"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "E:\toolkit\personal-toolbox"
!macroend
