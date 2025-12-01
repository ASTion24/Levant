import uvicorn
import webbrowser
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import json
import os
import google.generativeai as genai

# --- 0. 存档目录设置 ---
SAVES_DIR = "saves"
if not os.path.exists(SAVES_DIR):
    os.makedirs(SAVES_DIR)
    print(f"Created saves directory at: {SAVES_DIR}")

app = FastAPI(title="LevantD Engine Backend")

# --- 2. CORS 设置 ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 数据模型 (修正) ---
class GlobalVar(BaseModel):
    key: str
    value: str
class StatSchema(BaseModel):
    key: str
    label: str
class LoreEntry(BaseModel):
    keys: str
    content: str
    mode: str
# Faction model is now aligned with the generalized structure
class Faction(BaseModel):
    id: str
    name: str
    logo: str  # <--- 在这里加上这一行
    color: str
    desc: str
    stats: Dict[str, str]
class EventImpact(BaseModel):
    targetId: str
    targetName: str
    attrKey: str
    attrLabel: str
    change: str
class TimelineEvent(BaseModel):
    factionId: str
    timeStart: str
    timeEnd: str
    summary: str
    content: str
    impacts: List[EventImpact] = []
    isOpen: bool = False
class Turn(BaseModel):
    id: int
    timeRange: str
    events: List[TimelineEvent]
class GameState(BaseModel):
    global_vars: List[GlobalVar] = []  # <--- 关键修改：加入这一行，并给默认空列表
    stat_schema: List[StatSchema] 
    lorebook: List[LoreEntry]
    players: List[Faction]
    timeline: List[Turn]
    currentTurnPending: List[TimelineEvent] = []
class AIRequest(BaseModel):
    provider: str
    apiKey: str
    model: str
    systemPrompt: str
    context: str
    userPrompt: str
    useProxy: bool = False      # 新增
    proxyPort: str = "7890"     # 新增

# --- 3. API 路由 (已验证) ---

@app.get("/api/saves")
def get_saves_list():
    try:
        files = [f for f in os.listdir(SAVES_DIR) if f.endswith('.json')]
        return {"files": sorted(files)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/state", response_model=GameState)
def get_state(filename: str):
    filepath = os.path.join(SAVES_DIR, filename)
    # Special handling for the initial default savegame
    if filename == 'savegame.json' and not os.path.exists(filepath) and os.path.exists("savegame.json"):
        filepath = "savegame.json"
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Save file not found: {filename}")
    
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "schema" in data: data["stat_schema"] = data.pop("schema")
            # Compatibility fix for old saves
            for player in data.get("players", []):
                if "type" in player and "stats" in player and "type" not in player["stats"]:
                    player["stats"]["type"] = player.pop("type")
            return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading save file: {str(e)}")

@app.post("/api/state")
def save_state(filename: str, state: GameState):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    
    filepath = os.path.join(SAVES_DIR, filename)
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(state.model_dump_json(indent=2))
        return {"status": "saved", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

@app.delete("/api/saves/{filename}")
def delete_save(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    
    filepath = os.path.join(SAVES_DIR, filename)
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            return {"status": "deleted", "filename": filename}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.post("/api/ai/generate")
async def ai_generate(req: AIRequest):
    # --- 动态设置代理 ---
    if req.useProxy and req.proxyPort:
        proxy_url = f"http://127.0.0.1:{req.proxyPort}"
        os.environ["HTTP_PROXY"] = proxy_url
        os.environ["HTTPS_PROXY"] = proxy_url
    else:
        # 如果不使用代理，清除环境变量以免影响后续请求
        os.environ.pop("HTTP_PROXY", None)
        os.environ.pop("HTTPS_PROXY", None)
    
    try:
        if req.provider.lower() == "gemini":
            if not req.apiKey: raise HTTPException(status_code=400, detail="Missing API Key")
            model = genai.GenerativeModel(model_name=req.model or "gemini-2.5-flash")
            prompt = f"{req.systemPrompt}\n\n=== CONTEXT ===\n{req.context}\n\n=== INSTRUCTION ===\n{req.userPrompt}"
            response = model.generate_content(prompt)
            return {"result": response.text if response.text else "AI blocked content."}
        else: return {"result": "Provider not supported"}
    except Exception as e:
        print(f"AI Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- 4. 托管网页 ---
@app.get("/")
async def read_index():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return {"error": "index.html not found"}

@app.get("/logo.png")
async def get_logo():
    if os.path.exists("logo.png"):
        return FileResponse("logo.png")
    return {"error": "Logo not found"}

if __name__ == "__main__":
    # 自动打开浏览器
    webbrowser.open("http://127.0.0.1:8000")
    print("系统启动中... 请勿关闭此窗口")
    uvicorn.run(app, host="127.0.0.1", port=8000)