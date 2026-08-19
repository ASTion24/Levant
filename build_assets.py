import os
import json
import shutil

# 1. 生成音乐列表
sounds_dir = "www/sounds"
music_files = []
if os.path.exists(sounds_dir):
    music_files = sorted(
        (
            filename
            for filename in os.listdir(sounds_dir)
            if filename.lower().endswith(('.mp3', '.wav', '.ogg', '.flac'))
        ),
        key=str.casefold,
    )

# 2. 写入清单文件到 www 目录
manifest = {
    "music": music_files
}

with open("www/assets_manifest.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f)

print(f"[OK] Asset manifest generated with {len(music_files)} tracks.")

# 3. 复制初始存档
source_save = "saves/savegame.json"
target_save = "www/savegame.json"

if os.path.exists(source_save):
    shutil.copy2(source_save, target_save)
    print(f"[OK] Initial save copied to: {target_save}")
else:
    print(f"[WARN] Initial save not found: {source_save}")
