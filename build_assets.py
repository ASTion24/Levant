import os
import json
import shutil

# 1. 生成音乐列表
sounds_dir = "www/sounds"
music_files = []
if os.path.exists(sounds_dir):
    music_files = [f for f in os.listdir(sounds_dir) if f.endswith(('.mp3', '.wav', '.ogg', '.flac'))]

# 2. 写入清单文件到 www 目录
manifest = {
    "music": music_files
}

with open("www/assets_manifest.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f)

print(f"✅ 资源清单已生成！包含 {len(music_files)} 首音乐。")

# 3. 复制初始存档
source_save = "saves/savegame.json"
target_save = "www/savegame.json"

if os.path.exists(source_save):
    shutil.copy2(source_save, target_save)
    print(f"✅ 初始存档已复制到: {target_save}")
else:
    print(f"⚠️ 警告: 未找到 {source_save}，请确认你有初始存档！")