on run argv
  set movPath to item 1 of argv
  set outDir to item 2 of argv
  set greenPath to item 3 of argv
  tell application "Keynote Creator Studio"
    set doc to make new document with properties {document theme:theme "ベーシックホワイト", width:1920, height:1080}
    tell slide 1 of doc
      set bg to make new image with properties {file:POSIX file greenPath, position:{0, 0}, width:1920, height:1080}
      set mv to make new image with properties {file:POSIX file movPath, position:{200, 300}}
    end tell
    export doc to POSIX file (outDir & "/slide") as slide images with properties {image format:PNG, skipped slides:false}
    export doc to POSIX file (outDir & "/slide.m4v") as QuickTime movie with properties {movie format:native size}
    close doc saving no
  end tell
end run
