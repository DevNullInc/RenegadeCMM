; Renegade Core Model Manager (RenegadeCMM)
; Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
;
; This program is free software: you can redistribute it and/or modify
; it under the terms of the GNU General Public License as published by
; the Free Software Foundation, either version 3 of the License, or
; (at your option) any later version.
;
; Forces live extraction / installation progress log visibility inside the installer window

!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
  InstProgressFlags smooth
!macroend

!macro customInit
  ; Initialization
!macroend

!macro customInstall
  DetailPrint "Configuring Renegade Core Model Manager..."
!macroend

!macro customUnInstall
  DetailPrint "Removing Renegade Core Model Manager files..."
!macroend
