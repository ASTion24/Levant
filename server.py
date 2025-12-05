import uvicorn
import webbrowser
from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel
from typing import List, Dict, Any
import json
import os
import time
import logging
from logging.handlers import RotatingFileHandler

# --- 新增依赖 ---
import google.generativeai as genai
from openai import OpenAI  # 用于支持 DeepSeek, Qwen, Yi, Local LLM 等
import anthropic # 新增 Claude 支持

# --- 0. 目录与日志设置 ---
SAVES_DIR = "saves"
LOGS_DIR = "logs"

for d in [SAVES_DIR, LOGS_DIR]:
    if not os.path.exists(d):
        os.makedirs(d)

# 配置日志：同时输出到控制台和文件
log_file_path = os.path.join(LOGS_DIR, "system.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        RotatingFileHandler(log_file_path, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("Levant")

app = FastAPI(title="LevantD Engine Backend")

# --- 全局异常捕获中间件 (记录所有未捕获的错误) ---
@app.middleware("http")
async def log_exceptions(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logger.error(f"Unhandled Exception on {request.url.path}: {str(e)}", exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error. Check logs."})

# --- 2. CORS 设置 ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 数据模型 (全员防爆版) ---

class GlobalVar(BaseModel):
    key: str = "Unknown" 
    value: Any = ""      # 允许任意类型

class StatSchema(BaseModel):
    key: str = "unknown"
    label: str = "未知属性"

# [新增] 定义规则集的数据模型
class RuleSet(BaseModel):
    id: str
    name: str
    fields: List[StatSchema]

class LoreEntry(BaseModel):
    keys: str = "Unknown" # 以前是必填，现在给默认值
    content: str = ""
    mode: str = "auto"
    # 如果 AI 生成了 title，Pydantic 默认会忽略多余字段，但 keys 必须有值
    # 前端会负责把 title 塞进 keys 里，这里兜底防止报错

class Faction(BaseModel):
    id: str = "unknown_id"
    parentId: str = ""
    name: str = "Unknown Faction"
    logo: str = "fa-solid fa-users"
    color: str = "#000000"
    desc: str = ""
    # 【核心修复】必须有这一行，否则保存时实体的规则关联会被丢弃！
    schemaId: str = "default" 
    stats: Dict[str, Any] = {}

class MapPin(BaseModel):
    id: str
    x: float
    y: float
    type: str = "custom"
    label: str = "Marker"   # 给默认值防止报错
    linkId: str = ""
    icon: str = "" 
    color: str = ""

class MapRegion(BaseModel):
    id: str
    # 几何信息
    x: float 
    y: float
    w: float
    h: float
    centerX: float
    centerY: float
    maskData: str 
    
    # [修改] 这里必须匹配前端 saveMapPin 生成的 JSON 字段
    type: str = "territory"
    name: str = "New Region"  # 前端用的是 name
    ownerId: str = ""         # 前端用的是 ownerId
    
    # 视觉
    icon: str = ""
    color: str = ""

# [修改] 地图总数据
class MapData(BaseModel):
    image: str = "" 
    pins: List[MapPin] = []
    regions: List[MapRegion] = []

class EventImpact(BaseModel):
    type: str = "STAT_CHANGE"  # [新增] 关键字段：保存事件类型
    targetId: str = "?"
    targetName: str = "?"
    attrKey: str = "?"
    attrLabel: str = "?"
    oldValue: Any = "?"
    newValue: Any = "?"
    data: Dict[str, Any] = {}  # [新增] 用于存储 ENTITY_CREATE 等复杂数据

class TimelineEvent(BaseModel):
    factionId: str = "global"
    timeStart: str = "?"
    timeEnd: str = "?"
    summary: str = "New Event"
    content: str = ""
    impacts: List[EventImpact] = []
    isOpen: bool = False
    # [新增] 选项列表，用于交互式推演
    options: List[Any] = []

class Turn(BaseModel):
    id: int
    timeRange: str = "New Turn"
    events: List[TimelineEvent] = []

class GameState(BaseModel):
    global_vars: List[GlobalVar] = []
    
    # 【核心修复】这里必须是 rule_sets！
    # 如果这里写的是 stat_schema，前端发来的 rule_sets 会被扔进垃圾桶
    rule_sets: List[RuleSet] = [] 
    
    lorebook: List[LoreEntry] = []
    players: List[Faction] = []
    map_data: MapData = MapData()
    timeline: List[Turn] = []
    currentTurnPending: List[TimelineEvent] = []
    
# 修改 AIRequest 模型，确保 baseUrl 可选
class AIRequest(BaseModel):
    provider: str
    apiKey: str
    baseUrl: str = ""
    model: str
    systemPrompt: str
    context: str
    userPrompt: str
    useProxy: bool = False
    proxyPort: str = "7890"
    # 新增: 附件列表，格式为 [{"type": "image/png", "data": "base64..."}, {"type": "text/plain", "data": "文本内容..."}]
    attachments: List[Dict[str, str]] = [] 

# --- API 路由 ---

@app.get("/api/saves")
def get_saves_list():
    try:
        files = [f for f in os.listdir(SAVES_DIR) if f.endswith('.json')]
        logger.info(f"Loaded save list: {len(files)} files found.")
        return {"files": sorted(files)}
    except Exception as e:
        logger.error(f"Error fetching save list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/state", response_model=GameState)
def get_state(filename: str):
    filepath = os.path.join(SAVES_DIR, filename)
    if filename == 'savegame.json' and not os.path.exists(filepath) and os.path.exists("savegame.json"):
        filepath = "savegame.json"
    
    if not os.path.exists(filepath):
        logger.warning(f"Save file not found: {filename}")
        raise HTTPException(status_code=404, detail=f"Save file not found: {filename}")
    
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            
            # --- 【强力兼容补丁】 ---
            
            # 1. 如果存档里有 stat_schema 但没有 rule_sets (旧存档升级)
            if "rule_sets" not in data:
                # 尝试找旧的字段
                old_schema = data.get("stat_schema", data.get("schema", []))
                
                # 如果旧字段也没有，那就给个空的默认值
                if not old_schema:
                    old_schema = []
                    
                # 构造默认规则集
                data["rule_sets"] = [{
                    "id": "default",
                    "name": "通用实体 (Default)",
                    "fields": old_schema
                }]
                
                # 给所有实体打上默认标签
                for player in data.get("players", []):
                    if "schemaId" not in player:
                        player["schemaId"] = "default"
            
            # 2. 如果存档里有 schemaId 字段丢失的情况 (针对你刚才遇到的 bug)
            # 强制检查所有 rule_sets 的 ID，如果没有匹配的，就回落到第一个规则集
            if data.get("rule_sets"):
                valid_ids = [r["id"] for r in data["rule_sets"]]
                fallback_id = valid_ids[0] if valid_ids else "default"
                
                for player in data.get("players", []):
                    if "schemaId" not in player or player["schemaId"] not in valid_ids:
                        player["schemaId"] = fallback_id

            logger.info(f"Game state loaded: {filename}")
            return data
    except Exception as e:
        logger.error(f"Error reading save file {filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error reading save file: {str(e)}")

@app.post("/api/state")
def save_state(filename: str, state: GameState):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    
    filepath = os.path.join(SAVES_DIR, filename)
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(state.model_dump_json(indent=2))
        logger.info(f"Game state saved: {filename}")
        return {"status": "saved", "filename": filename}
    except Exception as e:
        logger.error(f"Error saving file {filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

@app.delete("/api/saves/{filename}")
def delete_save(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    filepath = os.path.join(SAVES_DIR, filename)
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            logger.info(f"Deleted save file: {filename}")
            return {"status": "deleted", "filename": filename}
        except Exception as e:
            logger.error(f"Error deleting file {filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail="File not found")

# [优化] 智能日志清洗函数
def smart_clean_payload(obj):
    """
    智能清洗日志：
    1. 保留长的文本 Context/Prompt (对调试很重要)。
    2. 仅过滤 API Key 和 疑似 Base64 的二进制数据字段。
    """
    if isinstance(obj, dict):
        new_obj = {}
        for k, v in obj.items():
            # 1. 敏感字段脱敏
            if k == 'apiKey':
                new_obj[k] = f"***{v[-4:]}" if v and isinstance(v, str) else "None"
            
            # 2. 靶向过滤：已知的二进制/Base64 字段名
            # 'data': 通常在 attachments 里
            # 'image', 'maskData': 地图数据
            # 'logo': 实体图标可能是 Base64
            elif k in ['data', 'image', 'maskData', 'logo', 'base64'] and isinstance(v, str):
                # 只有长度超过 200 才认为是 Base64，防止误伤短的 URL 或 FontAwesome class
                if len(v) > 200:
                    new_obj[k] = f"<BASE64_DATA_OMITTED size={len(v)}>"
                else:
                    new_obj[k] = v
            
            # 3. 递归处理
            else:
                new_obj[k] = smart_clean_payload(v)
        return new_obj
    
    elif isinstance(obj, list):
        return [smart_clean_payload(i) for i in obj]
    
    return obj

@app.post("/api/ai/generate")
def ai_generate(req: AIRequest):  # <--- 去掉 async
    # --- ★ 修改 1: 在请求开始时记录收到的数据 ★ ---
    # 使用 smart_clean_payload 替代简单的 dump
    raw_dump = req.model_dump()
    safe_log_req = smart_clean_payload(raw_dump)
    
    logger.info(f"AI Request Received. Payload:\n{json.dumps(safe_log_req, indent=2, ensure_ascii=False)}")
    
    # 代理设置 (保持不变)
    if req.useProxy and req.proxyPort:
        os.environ["HTTP_PROXY"] = f"http://127.0.0.1:{req.proxyPort}"
        os.environ["HTTPS_PROXY"] = f"http://127.0.0.1:{req.proxyPort}"
    else:
        os.environ.pop("HTTP_PROXY", None)
        os.environ.pop("HTTPS_PROXY", None)

    try:
        # === 分支 A: Gemini (Google) ===
        if req.provider.lower() == "gemini":
            if not req.apiKey: raise HTTPException(status_code=400, detail="Missing API Key")
            genai.configure(api_key=req.apiKey)
            model = genai.GenerativeModel(model_name=req.model or "gemini-1.5-flash")
            
            content_parts = []
            content_parts.append(req.systemPrompt + "\n\n" + req.context + "\n\n" + req.userPrompt)
            
            for att in req.attachments:
                if "image" in att["type"]:
                    content_parts.append({"mime_type": att["type"], "data": att["data"]})
                else:
                    content_parts.append(f"\n=== ATTACHMENT ({att['type']}) ===\n{att['data']}")

            response = model.generate_content(content_parts)
            result_text = response.text if response.text else "Blocked."
            
            # --- ★ 修改 2: 在返回前记录 AI 的原始响应 ★ ---
            logger.info(f"AI Response Generated. Raw result:\n---\n{result_text}\n---")
            return {"result": result_text}

        # === 分支 B: OpenAI Compatible (DeepSeek, GPT-4o, etc) ===
        elif req.provider.lower() in ["openai", "deepseek", "qwen", "custom", "siliconflow", "others"]:
            if not req.apiKey: raise HTTPException(status_code=400, detail="Missing API Key")
            base_url = req.baseUrl.strip() or "https://api.openai.com/v1"
            client = OpenAI(api_key=req.apiKey, base_url=base_url)

            messages = [{"role": "system", "content": req.systemPrompt}]
            
            user_content = []
            text_payload = f"=== CONTEXT ===\n{req.context}\n\n=== INSTRUCTION ===\n{req.userPrompt}"
            user_content.append({"type": "text", "text": text_payload})

            for att in req.attachments:
                if "image" in att["type"]:
                    user_content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{att['type']};base64,{att['data']}"}
                    })
                else:
                    user_content.append({"type": "text", "text": f"\n[FILE: {att.get('name', 'doc')}]\n{att['data']}"})

            messages.append({"role": "user", "content": user_content})

            completion = client.chat.completions.create(
                model=req.model,
                messages=messages,
                temperature=0.7,
            )
            result_text = completion.choices[0].message.content
            logger.info(f"AI Response Generated. Raw result:\n---\n{result_text}\n---")
            return {"result": result_text}

        # === 分支 C: Claude (Anthropic) ===
        elif req.provider.lower() == "claude":
            if not req.apiKey: raise HTTPException(status_code=400, detail="Missing API Key")
            client = anthropic.Anthropic(api_key=req.apiKey)
            
            # 构建消息
            message_content = []
            text_payload = f"=== CONTEXT ===\n{req.context}\n\n=== INSTRUCTION ===\n{req.userPrompt}"
            
            # 处理附件 (Claude 支持 image/jpeg, image/png, image/gif, image/webp)
            for att in req.attachments:
                if "image" in att["type"]:
                    media_type = att["type"]
                    message_content.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": att["data"]
                        }
                    })
                else:
                    text_payload += f"\n\n[ATTACHMENT: {att.get('name', 'file')}]\n{att['data']}"

            message_content.append({"type": "text", "text": text_payload})

            message = client.messages.create(
                model=req.model or "claude-3-5-sonnet-20240620",
                max_tokens=4096,
                temperature=0.7,
                system=req.systemPrompt,
                messages=[{"role": "user", "content": message_content}]
            )
            result_text = message.content[0].text
            logger.info(f"AI Response Generated. Raw result:\n---\n{result_text}\n---")
            return {"result": result_text}

        else:
            logger.warning(f"Unsupported provider requested: {req.provider}")
            
    except Exception as e:
        logger.error(f"AI Generation Failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI Error: {str(e)}")

# --- 托管网页 ---
@app.get("/")
async def read_index():
    if not os.path.exists("index.html"): return JSONResponse(status_code=404, content={"error": "index.html not found"})
    try:
        with open("index.html", "r", encoding="utf-8") as f: html_content = f.read()
        return Response(content=html_content, media_type="text/html", headers={"Cache-Control": "no-cache"})
    except Exception as e:
        logger.error(f"Index load error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/logo.png")
async def get_logo():
    if os.path.exists("logo.png"): return FileResponse("logo.png")
    return {"error": "Logo not found"}

if __name__ == "__main__":
    webbrowser.open("http://127.0.0.1:8000")
    print("系统启动中... 日志保存在 logs/system.log")
    uvicorn.run(app, host="127.0.0.1", port=8000)